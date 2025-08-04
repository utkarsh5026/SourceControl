/**
 * Enum representing the different types of Git objects.
 */
export enum ObjectType {
  BLOB = 'blob',
  TREE = 'tree',
  COMMIT = 'commit',
  TAG = 'tag',
}

export class ObjectTypeHelper {
  private constructor() {}

  public static getTypeName(type: ObjectType): string {
    return type;
  }

  public static fromString(type: string): ObjectType {
    const objectType = Object.values(ObjectType).find((t) => t === type);
    if (!objectType) {
      throw new Error(`Unknown object type: ${type}`);
    }
    return objectType;
  }
}
