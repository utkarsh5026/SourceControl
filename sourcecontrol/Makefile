.PHONY: build build-all test test-coverage test-watch test-watch-tables bench \
        clean install deps lint lint-fix fmt vet tidy coverage-html check \
        run playground playground-clean \
        security security-vuln security-scan \
        install-tools help

# Python interpreter — override with: make <target> PYTHON=python3
PYTHON := python

build: ## Build the binary
	@$(PYTHON) makefile.py build

build-all: ## Build for all platforms
	@$(PYTHON) makefile.py build-all

test: ## Run tests with -race and coverage
	@$(PYTHON) makefile.py test

test-coverage: ## Run tests and generate HTML coverage report
	@$(PYTHON) makefile.py test-coverage

test-watch: ## Watch and re-run tests on file change [uses gow]
	@$(PYTHON) makefile.py test-watch

test-watch-tables: ## Watch and re-run table tests [uses gow]
	@$(PYTHON) makefile.py test-watch-tables

bench: ## Run benchmarks
	@$(PYTHON) makefile.py bench

coverage-html: ## Generate HTML coverage report
	@$(PYTHON) makefile.py coverage-html

check: ## Run fmt + vet + test
	@$(PYTHON) makefile.py check

clean: ## Remove bin/, coverage files, and test cache
	@$(PYTHON) makefile.py clean

install: ## Install the binary to $$GOPATH/bin
	@$(PYTHON) makefile.py install

deps: ## Download and tidy dependencies
	@$(PYTHON) makefile.py deps

lint: ## Run golangci-lint
	@$(PYTHON) makefile.py lint

lint-fix: ## Run golangci-lint with auto-fix
	@$(PYTHON) makefile.py lint-fix

fmt: ## Format code with gofmt
	@$(PYTHON) makefile.py fmt

vet: ## Run go vet
	@$(PYTHON) makefile.py vet

tidy: ## go mod tidy + go mod verify
	@$(PYTHON) makefile.py tidy

run: ## Run the application (e.g. make run ARGS="init .")
	@$(PYTHON) makefile.py run $(ARGS)

playground: ## Build and run the playground setup tool
	@$(PYTHON) makefile.py playground $(ARGS)

playground-clean: ## Rebuild playground from scratch
	@$(PYTHON) makefile.py playground-clean $(ARGS)

security: ## Full security check: govulncheck + gosec
	@$(PYTHON) makefile.py security

security-vuln: ## Run govulncheck (known CVEs)
	@$(PYTHON) makefile.py security-vuln

security-scan: ## Run gosec (static security analysis)
	@$(PYTHON) makefile.py security-scan

install-tools: ## Install dev tools (gow, govulncheck, gosec)
	@$(PYTHON) makefile.py install-tools

help: ## Display this help screen
	@$(PYTHON) makefile.py help

.DEFAULT_GOAL := help
