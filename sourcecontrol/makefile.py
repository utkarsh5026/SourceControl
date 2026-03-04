#!/usr/bin/env python3
"""
makefile.py - Build system for SourceControl Go project.

Usage:
    python makefile.py <target> [args...]
    make <target>           (delegates here via Makefile)

All targets are identical to the original Makefile targets.
Requires: Python 3.7+
Optional: pip install colorama   (for colored terminal output)
"""

import inspect
import os
import platform
import shutil
import subprocess
import sys

try:
    from colorama import Fore, Style
    from colorama import init as _colorama_init

    _colorama_init(autoreset=True)
    HAS_COLOR = True
except ImportError:

    class _Stub:
        def __getattr__(self, _):
            return ""

    Fore = _Stub()
    Style = _Stub()
    HAS_COLOR = False

if not HAS_COLOR:
    print(
        "[INFO] colorama not installed. Run: pip install colorama  (optional, for colors)"
    )

BINARY_NAME = "sourcecontrol"
MAIN_PATH = "./cmd/sourcecontrol"
BUILD_DIR = "bin"


def print_header(title):
    bar = Fore.CYAN + Style.BRIGHT + "=" * 52 + Style.RESET_ALL
    label = Fore.CYAN + Style.BRIGHT + f"  {title}" + Style.RESET_ALL
    print(f"\n{bar}\n{label}\n{bar}")


def print_step(msg):
    print(f"{Fore.YELLOW}-->{Style.RESET_ALL} {msg}")


def print_success(msg):
    print(f"{Fore.GREEN}[OK]{Style.RESET_ALL} {msg}")


def print_warn(msg):
    print(f"{Fore.YELLOW}[WARN]{Style.RESET_ALL} {msg}")


def run_cmd(args, allow_failure=False, env=None):
    """
    Run a command as a subprocess, streaming output directly to the terminal.
    Exits with the subprocess exit code on failure unless allow_failure=True.
    stdout/stderr are NOT captured — Go color output passes through unmodified.
    """
    try:
        result = subprocess.run(args, env=env)
    except FileNotFoundError:
        print(f"{Fore.RED}[ERROR]{Style.RESET_ALL} Command not found: '{args[0]}'")
        print(f"        Ensure '{args[0]}' is installed and on your PATH.")
        if not allow_failure:
            sys.exit(127)
        return 127
    if result.returncode != 0 and not allow_failure:
        sys.exit(result.returncode)
    return result.returncode


# ── Build ────────────────────────────────────────────────────────────────────


def target_build():
    print_header("Building SourceControl")
    os.makedirs(BUILD_DIR, exist_ok=True)
    suffix = ".exe" if platform.system() == "Windows" else ""
    output = f"{BUILD_DIR}/{BINARY_NAME}{suffix}"
    run_cmd(["go", "build", "-ldflags", "-s -w", "-o", output, MAIN_PATH])
    print_success(f"Binary written to {output}")


def target_build_all():
    print_header("Building for All Platforms")
    os.makedirs(BUILD_DIR, exist_ok=True)
    cross_targets = [
        ("linux", "amd64", f"{BINARY_NAME}-linux-amd64"),
        ("darwin", "amd64", f"{BINARY_NAME}-darwin-amd64"),
        ("darwin", "arm64", f"{BINARY_NAME}-darwin-arm64"),
        ("windows", "amd64", f"{BINARY_NAME}-windows-amd64.exe"),
    ]
    env = os.environ.copy()
    for goos, goarch, output in cross_targets:
        print_step(f"Building {output}...")
        env["GOOS"] = goos
        env["GOARCH"] = goarch
        result = subprocess.run(
            ["go", "build", "-ldflags", "-s -w", "-o", f"{BUILD_DIR}/{output}", MAIN_PATH],
            env=env,
        )
        if result.returncode != 0:
            sys.exit(result.returncode)
    print_success("Cross-platform build complete")


def target_install():
    print_header("Installing SourceControl")
    run_cmd(["go", "install", MAIN_PATH])
    print_success("Install complete")


def target_deps():
    print_header("Downloading Dependencies")
    run_cmd(["go", "mod", "download"])
    run_cmd(["go", "mod", "tidy"])
    print_success("Dependencies downloaded")


def target_clean():
    print_header("Cleaning Build Artifacts")
    run_cmd(["go", "clean", "-testcache"])
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
        print_step(f"Removed {BUILD_DIR}/")
    for f in ["coverage.out", "coverage.html"]:
        if os.path.exists(f):
            os.remove(f)
            print_step(f"Removed {f}")
    print_success("Clean complete")


def target_fmt():
    print_header("Formatting Code")
    run_cmd(["go", "fmt", "./..."])


def target_vet():
    print_header("Vetting Code")
    run_cmd(["go", "vet", "./..."])


def target_lint():
    print_header("Running Linter")
    run_cmd(["golangci-lint", "run"], allow_failure=True)


def target_lint_fix():
    print_header("Running Linter with Auto-fix")
    run_cmd(["golangci-lint", "run", "--fix"])


def target_tidy():
    print_header("Tidying Go Modules")
    run_cmd(["go", "mod", "tidy"])
    run_cmd(["go", "mod", "verify"])


def target_coverage_html():
    print_header("Generating HTML Coverage Report")
    run_cmd(["go", "test", "./...", "-coverprofile=coverage.out"])
    run_cmd(["go", "tool", "cover", "-html=coverage.out", "-o", "coverage.html"])
    print_success("Coverage report written to coverage.html")


def target_bench():
    print_header("Running Benchmarks")
    run_cmd(["go", "test", "-bench=.", "-benchmem", "./..."])


def target_check():
    print_header("Full Check: fmt + vet + test")
    target_fmt()
    target_vet()
    target_test()


# ── Testing ──────────────────────────────────────────────────────────────────


def target_test():
    print_header("Running All Tests")
    run_cmd(["go", "test", "-v", "-race", "-coverprofile=coverage.out", "./..."])


def target_test_coverage():
    print_header("Running Tests with Coverage Report")
    run_cmd(["go", "test", "-v", "-race", "-coverprofile=coverage.out", "./..."])
    run_cmd(["go", "tool", "cover", "-html=coverage.out", "-o", "coverage.html"])
    print_success("Coverage report written to coverage.html")


def target_test_watch():
    print_header("Test Watch Mode (all packages)")
    print_step("Using 'gow' for cross-platform file watching — press Ctrl+C to stop")
    print_step("Install gow first if needed:  make install-tools")
    run_cmd(["gow", "test", "./...", "-v"])


def target_test_watch_tables():
    print_header("Test Watch Mode (tables package)")
    print_step("Using 'gow' for cross-platform file watching — press Ctrl+C to stop")
    print_step("Install gow first if needed:  make install-tools")
    run_cmd(["gow", "test", "./pkg/tables/...", "-v"])


# ── Run ──────────────────────────────────────────────────────────────────────


def target_run(extra_args=None):
    print_header("Running SourceControl")
    cmd = ["go", "run", MAIN_PATH]
    if extra_args:
        cmd.extend(extra_args)
    run_cmd(cmd)


def target_playground(extra_args=None):
    print_header("Setting up Playground")
    cmd = ["go", "run", "./cmd/playground"]
    if extra_args:
        cmd.extend(extra_args)
    run_cmd(cmd)


def target_playground_clean(extra_args=None):
    print_header("Rebuilding Playground from Scratch")
    cmd = ["go", "run", "./cmd/playground", "--clean"]
    if extra_args:
        cmd.extend(extra_args)
    run_cmd(cmd)


# ── Tools ────────────────────────────────────────────────────────────────────


def target_install_tools():
    print_header("Installing Development Tools")
    system = platform.system()
    if system == "Linux":
        print_step("Installing inotify-tools (Linux)...")
        run_cmd(["sudo", "apt-get", "update"], allow_failure=True)
        run_cmd(
            ["sudo", "apt-get", "install", "-y", "inotify-tools"], allow_failure=True
        )
    else:
        print_step(
            f"Skipping inotify-tools ({system}) — 'gow' is used instead on this platform"
        )
    print_step("Installing gow (cross-platform Go file watcher)...")
    run_cmd(["go", "install", "github.com/mitranim/gow@latest"], allow_failure=True)
    print_step("Installing govulncheck (Go vulnerability scanner)...")
    run_cmd(
        ["go", "install", "golang.org/x/vuln/cmd/govulncheck@latest"],
        allow_failure=True,
    )
    print_step("Installing gosec (Go security analyzer)...")
    run_cmd(
        ["go", "install", "github.com/securego/gosec/v2/cmd/gosec@latest"],
        allow_failure=True,
    )
    print_success("Tools installation complete!")


# ── Security ─────────────────────────────────────────────────────────────────


def target_security_vuln():
    print_header("Go Vulnerability Check (govulncheck)")
    run_cmd(["govulncheck", "./..."])


def target_security_scan():
    print_header("Go Security Analysis (gosec)")
    run_cmd(
        [
            "gosec",
            "-severity", "medium",
            "-confidence", "medium",
            "-exclude-dir=pkg/examples",
            "./...",
        ],
        allow_failure=True,
    )


def target_security():
    print_header("Full Security Check: govulncheck + gosec")
    target_security_vuln()
    target_security_scan()


# ── Target registry ──────────────────────────────────────────────────────────

TARGETS = {
    # Build
    "build":         (target_build,         "Build binary (bin/sourcecontrol)",              "Build"),
    "build-all":     (target_build_all,     "Cross-compile for Linux/macOS/Windows",         "Build"),
    "fmt":           (target_fmt,           "Format all Go code",                            "Build"),
    "vet":           (target_vet,           "Vet all Go code",                               "Build"),
    "lint":          (target_lint,          "Run golangci-lint",                             "Build"),
    "lint-fix":      (target_lint_fix,      "Run golangci-lint with auto-fix",               "Build"),
    "tidy":          (target_tidy,          "go mod tidy + go mod verify",                  "Build"),
    "coverage-html": (target_coverage_html, "Generate coverage.html report",                "Build"),
    "bench":         (target_bench,         "Run benchmarks (-bench=. -benchmem)",          "Build"),
    "check":         (target_check,         "fmt + vet + test",                             "Build"),
    # Testing
    "test":              (target_test,             "Run all tests (-race + coverage)",           "Testing"),
    "test-coverage":     (target_test_coverage,    "Run tests with HTML coverage report",        "Testing"),
    "test-watch":        (target_test_watch,       "Watch and re-run all tests [uses gow]",      "Testing"),
    "test-watch-tables": (target_test_watch_tables,"Watch and re-run table tests [uses gow]",    "Testing"),
    # Run
    "run":              (target_run,             "Run SourceControl (e.g. make run ARGS='init .')", "Run"),
    "playground":       (target_playground,      "Set up playground sandbox repos",                 "Run"),
    "playground-clean": (target_playground_clean,"Rebuild playground from scratch (--clean)",       "Run"),
    # Tools
    "install":       (target_install,       "Install binary to $GOPATH/bin",                "Tools"),
    "deps":          (target_deps,          "go mod download + go mod tidy",                "Tools"),
    "install-tools": (target_install_tools, "Install dev tools (gow, govulncheck, gosec)",  "Tools"),
    "clean":         (target_clean,         "Remove bin/, coverage files, test cache",      "Tools"),
    # Security
    "security":      (target_security,      "govulncheck + gosec (full security check)",    "Security"),
    "security-vuln": (target_security_vuln, "Run govulncheck (known CVEs)",                 "Security"),
    "security-scan": (target_security_scan, "Run gosec (static security analysis)",         "Security"),
    # Meta
    "help": (None, "Show this help message", "Meta"),
}


def target_help():
    from collections import defaultdict

    title = (
        Fore.CYAN
        + Style.BRIGHT
        + "SourceControl — Available Commands"
        + Style.RESET_ALL
    )
    print(f"\n{title}\n")
    groups = defaultdict(list)
    for name, (_, desc, group) in TARGETS.items():
        groups[group].append((name, desc))
    group_order = ["Build", "Testing", "Run", "Security", "Tools", "Meta"]
    for group in group_order:
        if group not in groups:
            continue
        header = Fore.YELLOW + Style.BRIGHT + f"{group}:" + Style.RESET_ALL
        print(header)
        for name, desc in groups[group]:
            padded = name.ljust(24)
            print(f"  {Fore.GREEN}{padded}{Style.RESET_ALL}  {desc}")
        print()
    if not HAS_COLOR:
        print("  Tip: pip install colorama  to enable colored output\n")


TARGETS["help"] = (target_help, "Show this help message", "Meta")


def main():
    if len(sys.argv) < 2:
        target_help()
        sys.exit(0)

    name = sys.argv[1]
    extra_args = sys.argv[2:] if len(sys.argv) > 2 else []

    if name not in TARGETS:
        print(f"{Fore.RED}[ERROR]{Style.RESET_ALL} Unknown target: '{name}'")
        print("  Run:  python makefile.py help  to list all available targets.")
        sys.exit(1)

    func, _, _ = TARGETS[name]
    sig = inspect.signature(func)
    if "extra_args" in sig.parameters:
        func(extra_args=extra_args if extra_args else None)
    else:
        func()


if __name__ == "__main__":
    main()
