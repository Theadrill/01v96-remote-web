const fs = require('fs');
const path = require('path');

class PropertyMap {
    constructor() {
        this.map = [];
        this.byName = new Map();
        this.byId = new Map();
        this._load();
    }

    _load() {
        const filePath = path.join(__dirname, '../reverse_dll_project/01v96_property_map.json');
        if (fs.existsSync(filePath)) {
            try {
                this.map = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.map.forEach(prop => {
                    this.byName.set(prop.name, prop);
                    this.byId.set(prop.id, prop);
                });
                console.log(`✅ [PropertyMap] ${this.map.length} propriedades carregadas.`);
            } catch (e) {
                console.error("❌ [PropertyMap] Erro ao carregar mapa:", e);
            }
        } else {
            console.error("❌ [PropertyMap] Arquivo não encontrado:", filePath);
        }
    }

    getPropertyByName(name) {
        return this.byName.get(name);
    }

    getPropertyById(id) {
        // Normaliza ID para hex string se for número
        const hexId = typeof id === 'number' ? id.toString(16) : id;
        return this.byId.get(hexId);
    }
    
    // Converte ID Hex da DLL para o formato [Section, Group, Element, Parameter] usado no protocol.js
    // Nota: Essa conversão é complexa pois depende da Tabela GG e Elementos. 
    // O SM2 usa uma lógica interna para mapear PropertyID -> SysEx Address.
}

module.exports = new PropertyMap();
