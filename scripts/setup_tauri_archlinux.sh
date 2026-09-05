#!/usr/bin/env bash
# ==============================================================================
# Setup Tauri v2 Build Dependencies on Arch Linux / SteamOS
# ==============================================================================
# Execução:
#   chmod +x setup_tauri_archlinux.sh
#   ./setup_tauri_archlinux.sh
# ==============================================================================

set -o pipefail

# Cores para feedback visual no terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Função executora de passos: aborta se houver qualquer erro
run_step() {
    local step_name="$1"
    shift
    log_info "Iniciando: ${step_name}..."

    if "$@"; then
        log_success "${step_name} concluído com sucesso!"
        echo "------------------------------------------------------------"
    else
        log_error "FALHA ao executar: ${step_name}"
        log_error "Comando que falhou: $*"
        echo -e "${RED}O script foi interrompido para evitar inconsistências.${NC}"
        exit 1
    fi
}

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}    INSTALADOR DE DEPENDÊNCIAS TAURI (ARCH LINUX / STEAMOS) ${NC}"
echo -e "${BLUE}============================================================${NC}"

# 1. Se for SteamOS (Steam Deck), desativar temporariamente o modo read-only
if command -v steamos-readonly &> /dev/null; then
    log_info "Detectado ambiente SteamOS (Steam Deck)."
    run_step "Desativar proteção somente-leitura (steamos-readonly disable)" \
        sudo steamos-readonly disable

    run_step "Inicializar pacman-key keyring" \
        sudo pacman-key --init

    run_step "Popular pacman-key com chaves Arch e Holo" \
        sudo pacman-key --populate archlinux holo
fi

# 2. Atualizar base de dados de pacotes do Arch Linux
run_step "Sincronizar base de dados de pacotes (pacman -Sy)" \
    sudo pacman -Sy --noconfirm

# 3. Instalar ferramentas essenciais de compilação (C/C++, headers, libs básicas)
PACKAGES_BASE=(
    base-devel
    curl
    wget
    git
    pkgconf
    openssl
    clang
)
run_step "Instalar ferramentas de build base (C/C++, Clang, OpenSSL)" \
    sudo pacman -S --needed --noconfirm "${PACKAGES_BASE[@]}"

# 4. Instalar bibliotecas de sistema exigidas pelo Tauri v2 / WebKit / GTK3
PACKAGES_TAURI=(
    gtk3
    webkit2gtk-4.1
    libappindicator-gtk3
    librsvg
)
run_step "Instalar bibliotecas gráficas e WebKit para Tauri (GTK3, WebKit2GTK 4.1, libappindicator)" \
    sudo pacman -S --needed --noconfirm "${PACKAGES_TAURI[@]}"

# 5. Instalar ou verificar Node.js e NPM
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    run_step "Instalar Node.js e NPM" \
        sudo pacman -S --needed --noconfirm nodejs npm
else
    log_success "Node.js ($(node -v)) e NPM ($(npm -v)) já estão instalados."
fi

# 6. Instalar e configurar Rust / Cargo via rustup
if ! command -v rustup &> /dev/null && ! command -v cargo &> /dev/null; then
    log_info "Rust não encontrado. Instalando rustup..."
    run_step "Baixar e instalar rustup" \
        bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"

    # Carregar Rust no ambiente atual
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
else
    log_success "Rust/Cargo já instalado ($(cargo --version 2>/dev/null || echo 'ok'))."
fi

# Garantir que o toolchain stable do Rust está configurado
if command -v rustup &> /dev/null; then
    run_step "Configurar toolchain stable do Rust" \
        rustup default stable
fi

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}  TODAS AS DEPENDÊNCIAS DO TAURI FORAM INSTALADAS COM SUCESSO!  ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e "Para compilar o aplicativo no Arch Linux / SteamOS, execute na pasta do projeto:"
echo -e "  ${YELLOW}npm install${NC}"
echo -e "  ${YELLOW}npx @tauri-apps/cli build${NC}"
echo -e "${GREEN}============================================================${NC}\n"
