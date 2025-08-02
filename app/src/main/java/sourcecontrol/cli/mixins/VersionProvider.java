package sourcecontrol.cli.mixins;

import picocli.CommandLine.IVersionProvider;
import java.io.InputStream;
import java.util.Properties;

public class VersionProvider implements IVersionProvider {

    @Override
    public String[] getVersion() throws Exception {
        Properties props = new Properties();
        try (InputStream is = getClass().getResourceAsStream("/git-clone-version.properties")) {
            if (is != null) {
                props.load(is);
            }
        }

        String version = props.getProperty("version", "1.0.0-SNAPSHOT");
        String buildTime = props.getProperty("build.time", "unknown");
        String gitCommit = props.getProperty("git.commit", "unknown");

        return new String[] {
                "@|bold source-control|@ version @|green " + version + "|@",
                "Built: " + buildTime,
                "Commit: " + gitCommit,
                "Java: " + System.getProperty("java.version"),
                "JVM: " + System.getProperty("java.vm.name") + " " + System.getProperty("java.vm.version")
        };
    }
}