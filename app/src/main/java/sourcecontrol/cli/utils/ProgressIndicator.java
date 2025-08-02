package sourcecontrol.cli.utils;

import java.io.PrintStream;

/**
 * Progress indicator for long-running operations
 */
public class ProgressIndicator {
    private final PrintStream out;
    private final String operation;
    private boolean active = false;
    private Thread spinnerThread;

    public ProgressIndicator(String operation) {
        this(System.err, operation);
    }

    public ProgressIndicator(PrintStream out, String operation) {
        this.out = out;
        this.operation = operation;
    }

    public void start() {
        if (active)
            return;

        active = true;
        spinnerThread = new Thread(() -> {
            String[] spinner = { "|", "/", "-", "\\" };
            int i = 0;

            while (active && !Thread.currentThread().isInterrupted()) {
                out.print("\r" + operation + " " + spinner[i++ % spinner.length]);
                out.flush();

                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        });

        spinnerThread.setDaemon(true);
        spinnerThread.start();
    }

    public void stop() {
        active = false;
        if (spinnerThread != null) {
            spinnerThread.interrupt();
        }
        out.print("\r" + operation + " ✓\n");
        out.flush();
    }

    public void stopWithError() {
        active = false;
        if (spinnerThread != null) {
            spinnerThread.interrupt();
        }
        out.print("\r" + operation + " ✗\n");
        out.flush();
    }
}