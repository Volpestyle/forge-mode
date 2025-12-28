import React, { useCallback, useMemo, useRef, useState } from "react";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import { Renderer } from "expo-three";
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as THREE from "three";
import { createDefaultEngine, createEmptyInput, Engine, EngineMode } from "@forge/engine";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const inputRef = useRef(createEmptyInput());
  const modeRef = useRef<EngineMode>("fly");
  const [mode, setMode] = useState<EngineMode>("fly");
  const verticalRef = useRef(0);
  const sprintRef = useRef(false);
  const rightDeltaRef = useRef({ dx: 0, dy: 0 });

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
      engine.update(dt, snapshot);
      renderer.render(engine.scene, engine.camera);
      gl.endFrameEXP();
      requestAnimationFrame(renderLoop);
    };

    renderLoop();
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />

      <View style={styles.hud} pointerEvents="box-none">
        <Text style={styles.title}>Forge Mode MVP0</Text>
        <View style={styles.modeRow}>
          {["fly", "fps", "sculpt"].map((value) => (
            <Pressable
              key={value}
              onPress={() => handleModeChange(value as EngineMode)}
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
