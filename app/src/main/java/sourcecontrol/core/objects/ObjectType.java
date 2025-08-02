package sourcecontrol.core.objects;

/**
 * Enum representing the different types of Git objects.
 */
public enum ObjectType {
    BLOB("blob"),
    TREE("tree"),
    COMMIT("commit"),
    TAG("tag");

    private final String typeName;

    ObjectType(String typeName) {
        this.typeName = typeName;
    }

    public String getTypeName() {
        return typeName;
    }

    public static ObjectType fromString(String type) {
        for (ObjectType objectType : values()) {
            if (objectType.typeName.equals(type)) {
                return objectType;
            }
        }
        throw new IllegalArgumentException("Unknown object type: " + type);
    }
}