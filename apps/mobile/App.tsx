import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import { Renderer } from "expo-three";
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Image,
  View
} from "react-native";
import * as THREE from "three";
import {
  createDefaultEngine,
  createEmptyInput,
  createProceduralMesh,
  Engine,
  EngineMode,
  Entity
} from "@forge/engine";
import { ApiClient } from "./src/services/apiClient";
import { LocalLibrary } from "./src/services/library";
import { EntityState, Prefab, Recipe, SessionServerMessage } from "@forge/shared";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SessionClient } from "./src/services/sessionClient";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const findFirstMesh = (object: THREE.Object3D): THREE.Mesh | null => {
  if (object instanceof THREE.Mesh) {
    return object;
  }
  let found: THREE.Mesh | null = null;
  object.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = child;
    }
  });
  return found;
};

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const inputRef = useRef(createEmptyInput());
  const modeRef = useRef<EngineMode>("fly");
  const selectedRef = useRef<Entity | null>(null);
  const jobsRef = useRef(new Map<string, { entity: Entity | null; prompt: string; status: string }>());
  const libraryRef = useRef(new LocalLibrary());
  const apiBase = (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? "http://localhost:8080";
  const apiRef = useRef(new ApiClient(apiBase));
  const textureLoaderRef = useRef(new THREE.TextureLoader());
  const gltfLoaderRef = useRef(new GLTFLoader());
  const roomId = (process.env.EXPO_PUBLIC_ROOM_ID as string | undefined) ?? "room_default";
  const sessionClientRef = useRef(new SessionClient(apiBase));
  const sessionClientIdRef = useRef<string | null>(null);
  const playerEntityIdRef = useRef<string | null>(null);
  const networkEntitiesRef = useRef(new Map<string, Entity>());
  const ownedEntitiesRef = useRef(new Set<string>());
  const lastSentTransformsRef = useRef(new Map<string, THREE.Vector3>());
  const lastNetworkSyncRef = useRef(0);

  const [mode, setMode] = useState<EngineMode>("fly");
  const [prompt, setPrompt] = useState("");
  const [meshStrategy, setMeshStrategy] = useState<"procedural" | "text_to_3d" | "image_to_3d">(
    "procedural"
  );
  const [jobs, setJobs] = useState<
    Array<{ jobId: string; prompt: string; status: string; thumbnailUrl?: string }>
  >([]);
  const [prefabs, setPrefabs] = useState<Prefab[]>([]);
  const [inspectorTick, setInspectorTick] = useState(0);

  const verticalRef = useRef(0);
  const sprintRef = useRef(false);
  const rightDeltaRef = useRef({ dx: 0, dy: 0 });

  const playerRecipe: Recipe = {
    kind: "character",
    name: "Player",
    scaleMeters: [0.8, 1.8, 0.8],
    style: "simple proxy",
    materials: [{ type: "cloth", roughness: 0.9, color: "#5c7c99" }],
    physics: { body: "dynamic", massKg: 90, collider: "box", friction: 4, restitution: 0.1 },
    interaction: { pickup: false, pushable: false },
    generationPlan: { meshStrategy: "procedural", textureStrategy: "flat", lods: false }
  };

  const applyAssetToEntity = async (entity: Entity, assetId: string) => {
    const asset = await apiRef.current.getAsset(assetId);
    entity.assetId = asset.assetId;
    entity.recipe = asset.generationRecipe;
    const { mesh } = createProceduralMesh(asset.generationRecipe);
    engineRef.current?.replaceEntityObject(entity, mesh, { preserveSize: true });

    if (asset.files?.textures?.length) {
      const albedo = asset.files.textures.find((entry) => entry.type === "albedo");
      if (albedo) {
        textureLoaderRef.current.load(albedo.url, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const target = findFirstMesh(entity.object);
          if (!target) {
            return;
          }
          const material = target.material as THREE.MeshStandardMaterial;
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
        });
      }
    }

    if (asset.files?.glbUrl) {
      gltfLoaderRef.current.load(asset.files.glbUrl, (gltf) => {
        engineRef.current?.replaceEntityObject(entity, gltf.scene, { preserveSize: true });
        if (asset.files?.textures?.length) {
          const albedo = asset.files.textures.find((entry) => entry.type === "albedo");
          if (albedo) {
            textureLoaderRef.current.load(albedo.url, (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              const target = findFirstMesh(entity.object);
              if (!target) {
                return;
              }
              const material = target.material as THREE.MeshStandardMaterial;
              material.map = texture;
              material.color.set(0xffffff);
              material.needsUpdate = true;
            });
          }
        }
      });
    }
  };

  const spawnEntityFromState = async (state: EntityState) => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const position = new THREE.Vector3(
      state.transform.position.x,
      state.transform.position.y,
      state.transform.position.z
    );
    const rotation = new THREE.Euler(
      state.transform.rotation.x,
      state.transform.rotation.y,
      state.transform.rotation.z
    );
    const scale = new THREE.Vector3(
      state.transform.scale.x,
      state.transform.scale.y,
      state.transform.scale.z
    );

    let entity: Entity;
    if (state.assetId === "player_proxy") {
      const recipe = { ...playerRecipe, scaleMeters: [scale.x, scale.y, scale.z] };
      entity = engine.spawnProceduralAsset({
        recipe,
        position,
        assetId: state.assetId,
        entityId: state.entityId
      });
    } else if (state.assetId.startsWith("asset_")) {
      entity = engine.spawnBox({
        position,
        size: scale,
        color: 0x5b6b72,
        entityId: state.entityId,
        assetId: state.assetId
      });
      await applyAssetToEntity(entity, state.assetId);
    } else {
      entity = engine.spawnBox({
        position,
        size: scale,
        color: 0x5b6b72,
        entityId: state.entityId,
        assetId: state.assetId
      });
    }

    entity.object.rotation.copy(rotation);
    networkEntitiesRef.current.set(state.entityId, entity);
  };

  const updateEntityFromState = async (state: EntityState) => {
    const entity = networkEntitiesRef.current.get(state.entityId);
    if (!entity) {
      await spawnEntityFromState(state);
      return;
    }
    if (state.assetId !== entity.assetId && state.assetId.startsWith("asset_")) {
      await applyAssetToEntity(entity, state.assetId);
    }
    engineRef.current?.applyEntityTransform(entity, {
      position: state.transform.position,
      rotation: state.transform.rotation,
      scale: state.transform.scale
    });
  };

  useEffect(() => {
    const loadPrefabs = async () => {
      const items = await libraryRef.current.load();
      setPrefabs(items);
    };
    loadPrefabs();

    apiRef.current.connectRealtime();
    const unsubscribe = apiRef.current.onEvent(async (event) => {
      if (event.type === "job_progress") {
        setJobs((current) =>
          current.map((job) =>
            job.jobId === event.jobId ? { ...job, status: event.status } : job
          )
        );
      }
      if (event.type === "job_failed") {
        setJobs((current) =>
          current.map((job) =>
            job.jobId === event.jobId ? { ...job, status: "failed" } : job
          )
        );
      }
      if (event.type === "asset_ready") {
        const job = jobsRef.current.get(event.jobId);
        if (!job || !engineRef.current) {
          return;
        }
        const asset = await apiRef.current.getAsset(event.assetId);
        let entity = job.entity;
        if (!entity) {
          entity = engineRef.current.spawnBox({
            position: new THREE.Vector3(0, 2, 0),
            size: new THREE.Vector3(1, 1, 1),
            color: 0x6b7882,
            entityId: event.entityId,
            assetId: asset.assetId
          });
          networkEntitiesRef.current.set(entity.id, entity);
        }
        await applyAssetToEntity(entity, asset.assetId);
        jobsRef.current.set(event.jobId, { ...job, entity, status: "ready" });
        setJobs((current) =>
          current.map((entry) =>
            entry.jobId === event.jobId
              ? { ...entry, status: "ready", thumbnailUrl: asset.files?.thumbnailUrl }
              : entry
          )
        );
        selectedRef.current = entity;
        setInspectorTick((value) => value + 1);
      }
    });

    sessionClientRef.current.connect(roomId);
    const unsubscribeSession = sessionClientRef.current.onMessage(async (message: SessionServerMessage) => {
      if (message.type === "welcome") {
        sessionClientIdRef.current = message.clientId;
        playerEntityIdRef.current = `player_${message.clientId}`;
        for (const entity of message.entities) {
          await updateEntityFromState(entity);
        }
      }
      if (message.type === "entity_spawned") {
        await updateEntityFromState(message.entity);
      }
      if (message.type === "entity_updated") {
        const entity = message.entity;
        if (entity.ownerId === sessionClientIdRef.current && entity.entityId === playerEntityIdRef.current) {
          if (entity.assetId !== networkEntitiesRef.current.get(entity.entityId)?.assetId) {
            await updateEntityFromState(entity);
          }
          return;
        }
        await updateEntityFromState(entity);
      }
      if (message.type === "entity_removed") {
        const existing = networkEntitiesRef.current.get(message.entityId);
        if (existing) {
          engineRef.current?.removeEntity(existing);
          networkEntitiesRef.current.delete(message.entityId);
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSession();
    };
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewportRef.current = { width, height };
    rendererRef.current?.setSize(width, height);
    engineRef.current?.setViewport(width, height);
  }, []);

  const consumeSnapshot = () => {
    const input = inputRef.current;
    input.move.y = verticalRef.current;
    input.sprint = sprintRef.current;

    const snapshot = {
      move: { ...input.move },
      look: { ...input.look },
      sprint: input.sprint,
      pointer: {
        ...input.pointer,
        width: viewportRef.current.width,
        height: viewportRef.current.height
      }
    };

    input.look.x = 0;
    input.look.y = 0;
    input.pointer.primaryPressed = false;
    input.pointer.primaryReleased = false;
    input.pointer.secondaryPressed = false;
    input.pointer.secondaryReleased = false;

    return snapshot;
  };

  const leftPad = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          inputRef.current.move.x = 0;
          inputRef.current.move.z = 0;
        },
        onPanResponderMove: (_event, gesture) => {
          const radius = 70;
          const x = clamp(gesture.dx / radius, -1, 1);
          const z = clamp(-gesture.dy / radius, -1, 1);
          inputRef.current.move.x = x;
          inputRef.current.move.z = z;
        },
        onPanResponderRelease: () => {
          inputRef.current.move.x = 0;
          inputRef.current.move.z = 0;
        }
      }),
    []
  );

  const rightPad = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_event, gesture) => {
          inputRef.current.pointer.primaryDown = true;
          inputRef.current.pointer.primaryPressed = true;
          inputRef.current.pointer.x = gesture.x0;
          inputRef.current.pointer.y = gesture.y0;
          rightDeltaRef.current = { dx: 0, dy: 0 };
        },
        onPanResponderMove: (_event, gesture) => {
          const deltaX = gesture.dx - rightDeltaRef.current.dx;
          const deltaY = gesture.dy - rightDeltaRef.current.dy;
          rightDeltaRef.current = { dx: gesture.dx, dy: gesture.dy };

          inputRef.current.pointer.x = gesture.moveX;
          inputRef.current.pointer.y = gesture.moveY;

          if (modeRef.current !== "sculpt") {
            inputRef.current.look.x -= deltaX * 0.003;
            inputRef.current.look.y -= deltaY * 0.003;
          }
        },
        onPanResponderRelease: () => {
          inputRef.current.pointer.primaryDown = false;
          inputRef.current.pointer.primaryReleased = true;
          rightDeltaRef.current = { dx: 0, dy: 0 };
        }
      }),
    []
  );

  const handleModeChange = (nextMode: EngineMode) => {
    setMode(nextMode);
    modeRef.current = nextMode;
    engineRef.current?.setMode(nextMode);
  };

  const getSpawnPosition = () => {
    const engine = engineRef.current;
    if (!engine) {
      return new THREE.Vector3(0, 2, 0);
    }
    const forward = new THREE.Vector3();
    engine.camera.getWorldDirection(forward);
    forward.normalize();
    return engine.camera.position.clone().addScaledVector(forward, 6);
  };

  const handleSubmitPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !engineRef.current) {
      return;
    }
    setPrompt("");
    let response;
    try {
      const spawn = getSpawnPosition();
      response = await apiRef.current.createJob({
        prompt: trimmed,
        assetType: "prop",
        draft: true,
        clientId: sessionClientIdRef.current ?? undefined,
        generationPlan: {
          meshStrategy,
          textureStrategy: "generated_pbr",
          lods: true
        },
        spawnTransform: {
          position: { x: spawn.x, y: spawn.y, z: spawn.z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      });
    } catch (error) {
      setPrompt(trimmed);
      return;
    }

    const placeholder = engineRef.current.spawnBox({
      position: getSpawnPosition(),
      size: new THREE.Vector3(...response.placeholder.scaleMeters),
      color: 0x6b7882,
      entityId: response.placeholder.entityId,
      assetId: response.placeholder.assetId
    });

    jobsRef.current.set(response.jobId, {
      entity: placeholder,
      prompt: trimmed,
      status: response.status
    });

    setJobs((current) => [
      ...current,
      { jobId: response.jobId, prompt: trimmed, status: response.status }
    ]);

    ownedEntitiesRef.current.add(response.placeholder.entityId);
    networkEntitiesRef.current.set(response.placeholder.entityId, placeholder);
    sessionClientRef.current.spawnEntity(roomId, {
      entityId: response.placeholder.entityId,
      assetId: response.placeholder.assetId,
      ownerId: sessionClientIdRef.current ?? undefined,
      transform: {
        position: { x: spawn.x, y: spawn.y, z: spawn.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      physics: {
        mass: placeholder.body.mass,
        friction: placeholder.body.friction,
        restitution: placeholder.body.restitution
      }
    });
  };

  const handleSavePrefab = async () => {
    if (!selectedRef.current?.recipe) {
      return;
    }
    await libraryRef.current.add(selectedRef.current.recipe);
    const items = libraryRef.current.list();
    setPrefabs(items);
  };

  const handleScaleSelected = (delta: number) => {
    const engine = engineRef.current;
    const selected = selectedRef.current;
    if (!engine || !selected) {
      return;
    }
    const next = Math.max(0.2, selected.object.scale.x + delta);
    engine.applyEntityTransform(selected, { scale: { x: next, y: next, z: next } });
    setInspectorTick((value) => value + 1);
  };

  const handleSpawnPrefab = (prefab: Prefab) => {
    if (!engineRef.current) {
      return;
    }
    const entity = engineRef.current.spawnProceduralAsset({
      recipe: prefab.recipe,
      position: getSpawnPosition(),
      assetId: prefab.prefabId
    });
    selectedRef.current = entity;
    setInspectorTick((value) => value + 1);
  };

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl });
    renderer.shadowMap.enabled = true;

    rendererRef.current = renderer;
    viewportRef.current = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight
    };
    renderer.setSize(viewportRef.current.width, viewportRef.current.height);

    const engine = createDefaultEngine(viewportRef.current);
    engineRef.current = engine;
    engine.setMode(modeRef.current);

    const clock = new THREE.Clock();

    const renderLoop = () => {
      const dt = Math.min(0.033, clock.getDelta());
      const snapshot = consumeSnapshot();

      if (modeRef.current === "fly" && snapshot.pointer.primaryPressed) {
        const hit = engine.pickEntityAtPointer(snapshot.pointer);
        if (hit && hit.id !== selectedRef.current?.id) {
          selectedRef.current = hit;
          setInspectorTick((value) => value + 1);
        }
      }

      engine.update(dt, snapshot);
      renderer.render(engine.scene, engine.camera);
      gl.endFrameEXP();

      const now = Date.now();
      if (
        sessionClientIdRef.current &&
        playerEntityIdRef.current &&
        now - lastNetworkSyncRef.current > 120
      ) {
        lastNetworkSyncRef.current = now;
        sessionClientRef.current.updateEntity(roomId, playerEntityIdRef.current, {
          transform: {
            position: {
              x: engine.camera.position.x,
              y: engine.camera.position.y,
              z: engine.camera.position.z
            },
            rotation: {
              x: engine.camera.rotation.x,
              y: engine.camera.rotation.y,
              z: engine.camera.rotation.z
            },
            scale: { x: 1, y: 1, z: 1 }
          }
        });

        for (const entityId of ownedEntitiesRef.current) {
          const entity = networkEntitiesRef.current.get(entityId);
          if (!entity) {
            continue;
          }
          const lastSent = lastSentTransformsRef.current.get(entityId);
          const current = entity.object.position.clone();
          if (!lastSent || lastSent.distanceTo(current) > 0.05) {
            lastSentTransformsRef.current.set(entityId, current.clone());
            sessionClientRef.current.updateEntity(roomId, entityId, {
              transform: {
                position: { x: current.x, y: current.y, z: current.z },
                rotation: {
                  x: entity.object.rotation.x,
                  y: entity.object.rotation.y,
                  z: entity.object.rotation.z
                },
                scale: {
                  x: entity.object.scale.x,
                  y: entity.object.scale.y,
                  z: entity.object.scale.z
                }
              },
              physics: {
                mass: entity.body.mass,
                friction: entity.body.friction,
                restitution: entity.body.restitution
              }
            });
          }
        }
      }

      requestAnimationFrame(renderLoop);
    };

    renderLoop();
  };

  const selectedEntity = selectedRef.current;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />

      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.title}>Forge Mode MVP1</Text>
        <View style={styles.modeRow}>
          {(["fly", "fps", "sculpt"] as EngineMode[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => handleModeChange(value)}
              style={({ pressed }) => [
                styles.modeButton,
                mode === value ? styles.modeButtonActive : null,
                pressed ? styles.modeButtonPressed : null
              ]}
            >
              <Text style={styles.modeButtonText}>{value.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.promptPanel}>
        <Text style={styles.panelTitle}>Prompt</Text>
        <View style={styles.promptRow}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe an object..."
            placeholderTextColor="rgba(240, 244, 247, 0.4)"
            style={styles.promptInput}
          />
          <Pressable style={styles.button} onPress={handleSubmitPrompt}>
            <Text style={styles.buttonText}>Spawn</Text>
          </Pressable>
        </View>
        <View style={styles.meshRow}>
          {(["procedural", "text_to_3d"] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setMeshStrategy(value)}
              style={({ pressed }) => [
                styles.meshButton,
                meshStrategy === value ? styles.meshButtonActive : null,
                pressed ? styles.modeButtonPressed : null
              ]}
            >
              <Text style={styles.meshButtonText}>{value.replace(\"_\", \" \")}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.queuePanel}>
        <Text style={styles.panelTitle}>Queue</Text>
        {jobs.map((job) => (
          <View key={job.jobId} style={styles.queueRow}>
            {job.thumbnailUrl ? (
              <Image source={{ uri: job.thumbnailUrl }} style={styles.queueThumb} />
            ) : (
              <View style={styles.queueThumb} />
            )}
            <Text style={styles.queuePrompt} numberOfLines={1}>
              {job.prompt}
            </Text>
            <Text style={styles.queueStatus}>{job.status}</Text>
          </View>
        ))}
        {jobs.length === 0 ? (
          <Text style={styles.panelEmpty}>No jobs yet.</Text>
        ) : null}
      </View>

      <View style={styles.inspectorPanel}>
        <Text style={styles.panelTitle}>Inspector</Text>
        {!selectedEntity ? (
          <Text style={styles.panelEmpty}>Tap an object to edit.</Text>
        ) : (
          <View key={inspectorTick}>
            <Text style={styles.inspectorText}>ID: {selectedEntity.id}</Text>
            <Text style={styles.inspectorText}>Pos: {selectedEntity.object.position.toArray().map((v) => v.toFixed(2)).join(", ")}</Text>
            <Text style={styles.inspectorText}>Scale: {selectedEntity.object.scale.x.toFixed(2)}</Text>
            <View style={styles.inspectorRow}>
              <Pressable style={styles.buttonTiny} onPress={() => handleScaleSelected(-0.1)}>
                <Text style={styles.buttonText}>Scale -</Text>
              </Pressable>
              <Pressable style={styles.buttonTiny} onPress={() => handleScaleSelected(0.1)}>
                <Text style={styles.buttonText}>Scale +</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={handleSavePrefab}>
              <Text style={styles.buttonText}>Save to Library</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.libraryPanel}>
        <Text style={styles.panelTitle}>Library</Text>
        {prefabs.length === 0 ? (
          <Text style={styles.panelEmpty}>No prefabs yet.</Text>
        ) : (
          prefabs.slice(0, 4).map((prefab) => (
            <View key={prefab.prefabId} style={styles.libraryRow}>
              <Text style={styles.queuePrompt} numberOfLines={1}>
                {prefab.name}
              </Text>
              <Pressable style={styles.buttonTiny} onPress={() => handleSpawnPrefab(prefab)}>
                <Text style={styles.buttonText}>Spawn</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.leftPad} {...leftPad.panHandlers} />
      <View style={styles.rightPad} {...rightPad.panHandlers} />

      <View style={styles.leftButtons} pointerEvents="box-none">
        <Pressable
          onPressIn={() => {
            verticalRef.current = 1;
          }}
          onPressOut={() => {
            if (verticalRef.current === 1) {
              verticalRef.current = 0;
            }
          }}
          style={({ pressed }) => [styles.controlButton, pressed ? styles.controlButtonPressed : null]}
        >
          <Text style={styles.controlButtonText}>Up</Text>
        </Pressable>
        <Pressable
          onPressIn={() => {
            verticalRef.current = -1;
          }}
          onPressOut={() => {
            if (verticalRef.current === -1) {
              verticalRef.current = 0;
            }
          }}
          style={({ pressed }) => [styles.controlButton, pressed ? styles.controlButtonPressed : null]}
        >
          <Text style={styles.controlButtonText}>Down</Text>
        </Pressable>
        <Pressable
          onPressIn={() => {
            sprintRef.current = true;
          }}
          onPressOut={() => {
            sprintRef.current = false;
          }}
          style={({ pressed }) => [styles.controlButton, pressed ? styles.controlButtonPressed : null]}
        >
          <Text style={styles.controlButtonText}>Sprint</Text>
        </Pressable>
      </View>

      <View style={styles.rightButtons} pointerEvents="box-none">
        <Pressable
          onPressIn={() => {
            inputRef.current.pointer.secondaryDown = true;
            inputRef.current.pointer.secondaryPressed = true;
          }}
          onPressOut={() => {
            inputRef.current.pointer.secondaryDown = false;
            inputRef.current.pointer.secondaryReleased = true;
          }}
          style={({ pressed }) => [styles.controlButton, pressed ? styles.controlButtonPressed : null]}
        >
          <Text style={styles.controlButtonText}>Lower</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0e1414"
  },
  gl: {
    flex: 1
  },
  hud: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(12, 18, 20, 0.72)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)",
    padding: 10
  },
  title: {
    color: "#f0f4f7",
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6
  },
  modeRow: {
    flexDirection: "row",
    gap: 6
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8
  },
  modeButtonActive: {
    backgroundColor: "rgba(127, 212, 255, 0.65)"
  },
  modeButtonPressed: {
    transform: [{ scale: 0.97 }]
  },
  modeButtonText: {
    color: "#f0f4f7",
    fontSize: 11
  },
  promptPanel: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 260,
    padding: 10,
    backgroundColor: "rgba(12, 18, 20, 0.72)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)"
  },
  promptRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center"
  },
  meshRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6
  },
  meshButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8
  },
  meshButtonActive: {
    backgroundColor: "rgba(127, 212, 255, 0.65)"
  },
  meshButtonText: {
    color: "#f0f4f7",
    fontSize: 10,
    textTransform: "uppercase"
  },
  promptInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: "#f0f4f7"
  },
  panelTitle: {
    color: "#7fd4ff",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6
  },
  button: {
    backgroundColor: "#7fd4ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  buttonTiny: {
    backgroundColor: "#7fd4ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  secondaryButton: {
    marginTop: 6,
    backgroundColor: "rgba(127, 212, 255, 0.4)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  buttonText: {
    color: "#0b1216",
    fontSize: 11,
    fontWeight: "600"
  },
  queuePanel: {
    position: "absolute",
    top: 120,
    right: 12,
    width: 260,
    padding: 10,
    backgroundColor: "rgba(12, 18, 20, 0.72)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)"
  },
  queueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: 6,
    borderRadius: 8,
    marginBottom: 6
  },
  queueThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginRight: 6
  },
  queuePrompt: {
    color: "#f0f4f7",
    fontSize: 11,
    flex: 1,
    marginRight: 6
  },
  queueStatus: {
    color: "#8cc4d9",
    fontSize: 10
  },
  inspectorPanel: {
    position: "absolute",
    top: 250,
    right: 12,
    width: 260,
    padding: 10,
    backgroundColor: "rgba(12, 18, 20, 0.72)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)"
  },
  inspectorText: {
    color: "#f0f4f7",
    fontSize: 11,
    marginBottom: 4
  },
  inspectorRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6
  },
  libraryPanel: {
    position: "absolute",
    top: 380,
    right: 12,
    width: 260,
    padding: 10,
    backgroundColor: "rgba(12, 18, 20, 0.72)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)"
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: 6,
    borderRadius: 8,
    marginBottom: 6
  },
  panelEmpty: {
    color: "rgba(240, 244, 247, 0.5)",
    fontSize: 11
  },
  leftPad: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.02)"
  },
  rightPad: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.02)"
  },
  leftButtons: {
    position: "absolute",
    left: 12,
    bottom: 12,
    gap: 8
  },
  rightButtons: {
    position: "absolute",
    right: 12,
    bottom: 12
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(240, 244, 247, 0.2)",
    backgroundColor: "rgba(12, 18, 20, 0.72)"
  },
  controlButtonPressed: {
    backgroundColor: "rgba(127, 212, 255, 0.65)"
  },
  controlButtonText: {
    color: "#f0f4f7",
    fontSize: 12
  }
});
