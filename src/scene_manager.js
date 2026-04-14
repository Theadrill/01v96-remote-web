const HEADER = [0xF0, 0x43, 0x20, 0x7E];
const SIGNATURE = [0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33]; // "LM  8C93"
const CMD_BULK_REQUEST = 0x6D;
const FOOTER = 0xF7;

class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentScene = null;
        this.activeSceneIndex = 0;
        this.isSyncing = false;
        this.io = null;
    }


    setIO(ioInstance) {
        this.io = ioInstance;
    }

    buildBulkRequest(type, index) {
        return [...HEADER, ...SIGNATURE, CMD_BULK_REQUEST, type, index, FOOTER];
    }

    fetchScenes(midiEngine) {
        return new Promise((resolve) => {
            if (this.isSyncing) {
                resolve();
                return;
            }
            this.isSyncing = true;
            this.scenes = [];
            this.currentScene = null;

            console.log('\n📚 [Scene Manager] Iniciando sincronização da Biblioteca de Cenas...');
            let queue = [];
        
        // Pede o "Current Edit Buffer" (Index 0, type 0x02)
        queue.push({ type: 0x02, index: 0 });

        // Pede as cenas 1 a 99 (Library, type 0x00)
        for (let i = 1; i <= 99; i++) {
            queue.push({ type: 0x00, index: i });
        }

        let sentCount = 0;
        const intervalId = setInterval(() => {
            if (queue.length === 0) {
                clearInterval(intervalId);
                console.log('✅ [Scene Manager] Todas as requisições de cena enviadas, aguardando finalização dos dumps...');
                
                // Aguarda um pequeno tempo para os últimos dumps chegarem
                setTimeout(() => {
                    this.isSyncing = false;
                    console.log(`✅ [Scene Manager] Sincronização concluída! ${this.scenes.filter(Boolean).length} cenas carregadas.`);
                    if (this.io) {
                        this.io.emit('scenesUpdated', this.getState());
                    }
                    resolve();
                }, 2000);
                return;
            }

            const req = queue.shift();
            midiEngine.send(this.buildBulkRequest(req.type, req.index));
            sentCount++;
            
            if (sentCount % 20 === 0) {
                console.log(`⏳ [Scene Manager] Progresso: ${sentCount}/100...`);
            }
        }, 50); // 50ms para suportar a carga de dumps maiores (>500b)
        });
    }

    handleMIDIData(message) {
        if (!message || message.length <= 20) return false;

        // Header: F0 43 00 7E ... (Type Response=00) ... 6D
        if (message[0] === 0xF0 && message[1] === 0x43 && message[14] === 0x6D) {
            const type = message[15];
            const index = message[16];

            // Respostas Type 00 (Library) ou Type 02 (Edit Buffer)
            if ((type === 0x00 || type === 0x02) && message.length > 21) {
                // Nome comeca no offset 20 e tem tamanho 16
                let name = '';
                for (let i = 0; i < 16; i++) {
                    const charCode = message[20 + i];
                    if (charCode >= 32 && charCode <= 126) {
                        name += String.fromCharCode(charCode);
                    } else if (charCode !== 0) {
                        name += ' ';
                    }
                }
                name = name.trim();

                const sceneData = { index, name };

                if (type === 0x02) {
                    this.currentScene = {
                        index: this.activeSceneIndex || 0, // Usa o index ativamente armazenado
                        name: sceneData.name
                    };
                    if (this.io) this.io.emit('currentScene', this.currentScene);
                } else {
                    this.scenes[index] = sceneData;
                }

                return true; // Mensagem consumida com sucesso
            }
        }
        return false;
    }

    getState() {
        return {
            currentScene: this.currentScene,
            scenes: this.scenes.filter(s => s != null) // Retorna lista compactada
        };
    }

    getScenes() {
        return this.scenes.filter(s => s != null);
    }

    getCurrentScene() {
        if (!this.currentScene) return null;
        return {
            index: this.activeSceneIndex || 0,
            name: this.currentScene.name
        };
    }

    setActiveScene(index) {
        this.activeSceneIndex = index;
        if (this.currentScene) {
            this.currentScene.index = index;
        }
    }
}


module.exports = new SceneManager();
