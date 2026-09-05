#!/usr/bin/env bash
# ==============================================================================
# Setup & Build Tauri v2 on Arch Linux / SteamOS (100% Rust / Cargo)
# ==============================================================================
# Execução:
#   chmod +x scripts/setup_tauri_archlinux.sh
#   ./scripts/setup_tauri_archlinux.sh
# ==============================================================================

set -o pipefail

# Cores para feedback visual no terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[AVISO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERRO]${NC} $1"
}

# Executa um comando com verificação estrita de erro
run_step() {
    local step_name="$1"
    shift
    log_info "Iniciando: ${step_name}..."

    if "$@"; then
        log_success "${step_name} concluído com sucesso!"
        echo "------------------------------------------------------------"
    else
        echo ""
        log_error "FALHA ao executar: ${step_name}"
        log_error "Comando que falhou: $*"
        echo -e "${RED}O script foi interrompido para evitar inconsistências.${NC}"
        echo -e "${YELLOW}Verifique as mensagens de erro acima para solucionar o problema.${NC}\n"
        exit 1
    fi
}

# Garantir que estamos na raiz do projeto (um diretório acima de scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}" || exit 1

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}    SETUP & BUILD TAURI (ARCH LINUX / STEAMOS - 100% RUST)  ${NC}"
echo -e "${BLUE}============================================================${NC}"
log_info "Diretório raiz do projeto: ${ROOT_DIR}"

# 1. Configuração específica do SteamOS (Steam Deck)
if command -v steamos-readonly &> /dev/null; then
    log_info "Detectado ambiente SteamOS (Steam Deck)."

    # Desativar read-only do sistema de arquivos
    if steamos-readonly status 2>/dev/null | grep -qi "enabled"; then
        run_step "Desativar proteção somente-leitura (steamos-readonly disable)" \
            sudo steamos-readonly disable
    else
        log_success "SteamOS read-only já está desativado."
    fi

    # Reparar / Inicializar chaveiros do pacman (necessário no SteamOS após desativar readonly)
    log_info "Garantindo chaveiros e chaves PGP do pacman (Arch Linux & Valve Holo)..."
    run_step "Inicializar pacman-key keyring" \
        sudo pacman-key --init

    run_step "Popular chaves archlinux e holo" \
        sudo pacman-key --populate archlinux holo
fi

# 2. Restaurar headers C e arquivos de desenvolvimento (.pc, headers) do sistema
# No SteamOS, a imagem de fábrica vem com /usr/include e /usr/lib/pkgconfig incompletos para pacotes pré-instalados
DEV_SYSTEM_PACKAGES=(
    glibc
    linux-api-headers
    glib2
    gtk3
    cairo
    pango
    gdk-pixbuf2
    harfbuzz
    libsoup3
)

NEED_DEV_RESTORE=false
if [ ! -f "/usr/include/stdio.h" ] || [ ! -f "/usr/include/stdint.h" ] || [ ! -f "/usr/lib/pkgconfig/glib-2.0.pc" ] || [ ! -f "/usr/lib/pkgconfig/gtk+-3.0.pc" ]; then
    NEED_DEV_RESTORE=true
fi

if [ "$NEED_DEV_RESTORE" = true ]; then
    log_warn "Arquivos de desenvolvimento/headers ausentes (padrão em imagens de fábrica do SteamOS)."
    run_step "Sincronizar base de pacotes do pacman" \
        sudo pacman -Sy --noconfirm
    run_step "Restaurar pacotes base de desenvolvimento (headers, .pc, pkg-config)" \
        sudo pacman -S --needed --noconfirm --overwrite '*' "${DEV_SYSTEM_PACKAGES[@]}"
else
    log_success "Arquivos de desenvolvimento do sistema (glib-2.0.pc, gtk+-3.0.pc, headers) verificados e presentes."
fi

# 3. Pacotes de sistema necessários (base de compilação + libs gráficas/WebKit do Tauri)
REQUIRED_PACKAGES=(
    base-devel
    curl
    wget
    git
    pkgconf
    openssl
    clang
    gtk3
    webkit2gtk-4.1
    libappindicator-gtk3
    librsvg
)

MISSING_PACKAGES=()
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! pacman -Qi "$pkg" &> /dev/null; then
        MISSING_PACKAGES+=("$pkg")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    log_info "Pacotes do sistema faltantes detectados: ${MISSING_PACKAGES[*]}"
    run_step "Sincronizar base de dados do pacman" \
        sudo pacman -Sy --noconfirm
    run_step "Instalar dependências de sistema faltantes" \
        sudo pacman -S --needed --noconfirm "${MISSING_PACKAGES[@]}"
else
    log_success "Todas as dependências de sistema (GTK3, WebKit2GTK, Clang, OpenSSL, etc.) já estão instaladas."
fi

# 4. Carregar e verificar Rust / Cargo
if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup &> /dev/null && ! command -v cargo &> /dev/null; then
    log_info "Rust/Cargo não encontrado. Instalando rustup..."
    run_step "Baixar e instalar rustup (Rust + Cargo)" \
        bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"

    if [ -f "$HOME/.cargo/env" ]; then
        # shellcheck source=/dev/null
        source "$HOME/.cargo/env"
    fi
    export PATH="$HOME/.cargo/bin:$PATH"
else
    log_success "Rust/Cargo já instalado ($(cargo --version 2>/dev/null || echo 'Rust instalado'))."
fi

# Garantir toolchain stable configurado
if command -v rustup &> /dev/null; then
    CURRENT_DEFAULT=$(rustup default 2>/dev/null || echo "")
    if [[ "$CURRENT_DEFAULT" != *"stable"* ]]; then
        run_step "Configurar toolchain stable do Rust" \
            rustup default stable
    else
        log_success "Toolchain stable do Rust já está ativa."
    fi
fi

# 5. Verificar ou instalar Tauri CLI via Cargo (cargo-tauri)
if ! cargo tauri --version &> /dev/null; then
    log_info "CLI do Tauri (cargo-tauri) não encontrada. Instalando..."

    # Se cargo-binstall não existir, tenta instalar para acelerar downloads binários
    if ! command -v cargo-binstall &> /dev/null; then
        log_info "Tentando obter cargo-binstall para instalação rápida de binários..."
        curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash 2>/dev/null || true
    fi

    if command -v cargo-binstall &> /dev/null; then
        run_step "Instalar tauri-cli (binário pré-compilado via binstall)" \
            cargo binstall -y tauri-cli
    else
        run_step "Instalar tauri-cli via Cargo (compilação)" \
            cargo install tauri-cli --version "^2.0.0" --locked
    fi
else
    log_success "Tauri CLI já instalada ($(cargo tauri --version 2>/dev/null))."
fi

# 6. Executar o build do Tauri (Release)
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${CYAN}             INICIANDO COMPILAÇÃO DO TAURI                  ${NC}"
echo -e "${CYAN}============================================================${NC}"

run_step "Compilar aplicação Tauri (cargo tauri build)" \
    cargo tauri build

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}          BUILD CONCLUÍDO COM SUCESSO!                      ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e "Os binários gerados estão disponíveis em:"
echo -e "  Binário direto: ${YELLOW}src-tauri/target/release/app${NC} (ou target/release/)"
echo -e "  Pacote/Bundle:  ${YELLOW}src-tauri/target/release/bundle/${NC}"
echo -e "${GREEN}============================================================${NC}\n"
