package sourcecontrol.exceptions;

public class ObjectException extends GitException {
    public ObjectException(String message) {
        super(message);
    }

    public ObjectException(String message, Throwable cause) {
        super(message, cause);
    }
}
