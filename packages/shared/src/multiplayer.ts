export type Vec3 = { x: number; y: number; z: number };

export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type PhysicsState = {
  mass?: number;
  friction?: number;
  restitution?: number;
};

export type EntityState = {
  entityId: string;
  assetId: string;
  ownerId?: string;
  transform: Transform;
  physics?: PhysicsState;
};

export type SessionClientMessage =
  | { type: "join"; roomId: string; clientId?: string }
  | { type: "spawn_entity"; roomId: string; entity: EntityState }
  | {
      type: "update_entity";
      roomId: string;
      entityId: string;
      transform?: Partial<Transform>;
      physics?: PhysicsState;
      assetId?: string;
    }
  | { type: "remove_entity"; roomId: string; entityId: string };

export type SessionServerMessage =
  | { type: "welcome"; roomId: string; clientId: string; entities: EntityState[] }
  | { type: "entity_spawned"; roomId: string; entity: EntityState }
  | { type: "entity_updated"; roomId: string; entity: EntityState }
  | { type: "entity_removed"; roomId: string; entityId: string };
