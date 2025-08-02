#!/bin/bash

# SourceControl Setup Script
# This script sets up the complete build environment for the SourceControl project
    
set -e  # Exit on any error

echo "🚀 Setting up SourceControl Build Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Java
    if ! command -v java &> /dev/null; then
        print_error "Java is not installed. Please install Java 17 or later."
        exit 1
    fi
    
    java_version=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
    if [ "$java_version" -lt 17 ]; then
        print_error "Java 17 or later is required. Found Java $java_version"
        exit 1
    fi
    
    print_success "Java $java_version found"
    
    # Check if we're in the right directory
    if [ ! -f "README.md" ] || [ ! -d "app/src/main/java/sourcecontrol" ]; then
        print_error "Please run this script from the SourceControl project root directory"
        exit 1
    fi
}

# Create directory structure
create_structure() {
    print_status "Creating project structure..."
    
    # Create necessary directories
    mkdir -p gradle/wrapper
    mkdir -p scripts
    mkdir -p app/src/main/resources
    mkdir -p app/src/test/java
    
    print_success "Directory structure created"
}

# Create Gradle files
create_gradle_files() {
    print_status "Creating Gradle configuration files..."
    
    # Create settings.gradle
    cat > settings.gradle << 'EOF'
rootProject.name = 'sourcecontrol'
include 'app'
EOF

    # Create root build.gradle
    cat > build.gradle << 'EOF'
// Root build script - manages common configuration
subprojects {
    apply plugin: 'java'
    
    repositories {
        mavenCentral()
    }
    
    java {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    group = 'com.sourcecontrol'
    version = '1.0.0-SNAPSHOT'
}
EOF

    print_success "Gradle files created"
}

# Create resource files
create_resources() {
    print_status "Creating resource files..."
    
    # Create version properties template
    cat > app/src/main/resources/git-clone-version.properties << 'EOF'
version=${version}
build.time=${build.time}
git.commit=${git.commit}
EOF

    # Create logback configuration
    cat > app/src/main/resources/logback.xml << 'EOF'
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <logger name="sourcecontrol" level="INFO" />
    
    <root level="WARN">
        <appender-ref ref="STDOUT" />
    </root>
</configuration>
EOF

    print_success "Resource files created"
}

# Create launcher scripts
create_scripts() {
    print_status "Creating launcher scripts..."
    
    # Unix script
    cat > scripts/source-control << 'EOF'
#!/bin/bash

# Find the directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Find the JAR file
JAR_FILE=""
if [ -f "$SCRIPT_DIR/source-control.jar" ]; then
    JAR_FILE="$SCRIPT_DIR/source-control.jar"
elif [ -f "$SCRIPT_DIR/../lib/source-control.jar" ]; then
    JAR_FILE="$SCRIPT_DIR/../lib/source-control.jar"
elif [ -f "$SCRIPT_DIR/../app/build/libs/source-control.jar" ]; then
    JAR_FILE="$SCRIPT_DIR/../app/build/libs/source-control.jar"
fi

if [ -z "$JAR_FILE" ]; then
    echo "Error: Could not find source-control.jar"
    exit 1
fi

# Execute the application
exec java -jar "$JAR_FILE" "$@"
EOF

    # Windows script
    cat > scripts/source-control.bat << 'EOF'
@echo off

REM Find the JAR file
set JAR_FILE=
if exist "%~dp0source-control.jar" (
    set JAR_FILE=%~dp0source-control.jar
) else if exist "%~dp0..\lib\source-control.jar" (
    set JAR_FILE=%~dp0..\lib\source-control.jar
) else if exist "%~dp0..\app\build\libs\source-control.jar" (
    set JAR_FILE=%~dp0..\app\build\libs\source-control.jar
)

if "%JAR_FILE%"=="" (
    echo Error: Could not find source-control.jar
    exit /b 1
)

REM Execute the application
java -jar "%JAR_FILE%" %*
EOF

    chmod +x scripts/source-control
    
    print_success "Launcher scripts created"
}

# Initialize Gradle wrapper
init_gradle() {
    print_status "Initializing Gradle wrapper..."
    
    # Check if gradle is available
    if command -v gradle &> /dev/null; then
        gradle wrapper --gradle-version 8.4
    else
        print_warning "Gradle not found. Downloading Gradle wrapper manually..."
        
        # Download Gradle wrapper
        mkdir -p gradle/wrapper
        
        # Download gradle-wrapper.jar
        curl -L -o gradle/wrapper/gradle-wrapper.jar \
            https://github.com/gradle/gradle/raw/v8.4.0/gradle/wrapper/gradle-wrapper.jar
        
        # Create gradle-wrapper.properties
        cat > gradle/wrapper/gradle-wrapper.properties << 'EOF'
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.4-bin.zip
networkTimeout=10000
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
EOF

        # Create gradlew scripts
        cat > gradlew << 'EOF'
#!/bin/sh

DEFAULT_JVM_OPTS='"-Xmx64m" "-Xms64m"'
APP_NAME="Gradle"
APP_BASE_NAME=`basename "$0"`

# Resolve links: $0 may be a link
PRG="$0"
while [ -h "$PRG" ] ; do
    ls=`ls -ld "$PRG"`
    link=`expr "$ls" : '.*-> \(.*\)$'`
    if expr "$link" : '/.*' > /dev/null; then
        PRG="$link"
    else
        PRG=`dirname "$PRG"`"/$link"
    fi
done

SAVED="`pwd`"
cd "`dirname \"$PRG\"`/" >/dev/null
APP_HOME="`pwd -P`"
cd "$SAVED" >/dev/null

CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar

exec java $DEFAULT_JVM_OPTS -cp "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
EOF

        chmod +x gradlew
    fi
    
    print_success "Gradle wrapper initialized"
}

# Build the project
build_project() {
    print_status "Building the project..."
    
    ./gradlew clean build shadowJar
    
    if [ $? -eq 0 ]; then
        print_success "Project built successfully!"
        print_status "JAR location: app/build/libs/source-control.jar"
    else
        print_error "Build failed!"
        exit 1
    fi
}

# Install locally
install_local() {
    print_status "Installing locally to ~/.local/bin..."
    
    mkdir -p ~/.local/bin
    
    # Copy JAR and script
    cp app/build/libs/source-control.jar ~/.local/bin/
    cp scripts/source-control ~/.local/bin/
    chmod +x ~/.local/bin/source-control
    
    print_success "Installed to ~/.local/bin"
    
    # Check if ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        print_warning "~/.local/bin is not in your PATH"
        echo -e "${YELLOW}Add this line to your ~/.bashrc or ~/.zshrc:${NC}"
        echo -e "${GREEN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
        echo -e "${YELLOW}Then restart your terminal or run:${NC} source ~/.bashrc"
    fi
}

# Test installation
test_installation() {
    print_status "Testing installation..."
    
    if command -v source-control &> /dev/null; then
        echo -e "${GREEN}✓ source-control command is available${NC}"
        source-control --version
        print_success "Installation test passed!"
    else
        print_warning "source-control command not found in PATH"
        print_status "You can still run it with: ~/.local/bin/source-control"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    cat << 'EOF'
  ╔═══════════════════════════════════════════╗
  ║              SourceControl                ║
  ║         Setup & Build Script              ║
  ╚═══════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    check_prerequisites
    create_structure
    create_gradle_files
    create_resources
    create_scripts
    init_gradle
    build_project
    
    read -p "Do you want to install locally to ~/.local/bin? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_local
        test_installation
    fi
    
    echo
    print_success "Setup complete! 🎉"
    echo
    echo -e "${BLUE}Next steps:${NC}"
    echo "• Run: ./gradlew run --args='--help' to test during development"
    echo "• Run: ./gradlew shadowJar to build distributable JAR"
    echo "• Run: java -jar app/build/libs/source-control.jar --help"
    echo "• If installed locally: source-control --help"
    echo
    echo -e "${BLUE}Available Gradle tasks:${NC}"
    echo "• ./gradlew build          - Build the project"
    echo "• ./gradlew test           - Run tests"
    echo "• ./gradlew shadowJar      - Create fat JAR"
    echo "• ./gradlew distZip        - Create ZIP distribution"
    echo "• ./gradlew distTar        - Create TAR distribution"
    echo
}

# Run main function
main "$@"