const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const stateManager = require('../state-manager');

// Raiz do projeto (dois níveis acima de src/api/)
const ROOT_DIR = path.join(__dirname, '..', '..');

// --- GIT SYNC ---
let gitSyncTimer = null;
let gitSyncQueue = new Set();
let gitSyncMessage = null;

function triggerGitSync() {
    if (gitSyncQueue.size === 0) return;
    
    // Normalize paths for git (forward slashes) and quote them for safety
    const filesToSync = Array.from(gitSyncQueue)
        .map(f => `"${f.replace(/\\/g, '/')}"`)
        .join(' ');
        
    const hostname = os.hostname();
    const msg = gitSyncMessage || `auto-sync: profiles updated from ${hostname}`;
    // Escape quotes for the commit message
    const escapedMsg = msg.replace(/"/g, '\\"');
    
    // Use git add then commit. If commit fails (no changes), it continues to pull and push.
    // We use a more explicit chain to ensure pull/push always run if staging is ok.
    const cmd = `git add ${filesToSync} && (git commit -m "${escapedMsg}" || echo "Nothing to commit") && git pull --rebase --autostash && git push`;
    
    console.log(`🚀 [NINJA SYNC] Iniciando sync: ${msg}`);
    
    exec(cmd, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
        const currentQueue = Array.from(gitSyncQueue);
        gitSyncQueue.clear();
        gitSyncMessage = null; 
        
        if (error) {
            console.error(`❌ [NINJA SYNC] Falha no comando Git!`);
            console.error(`Status code: ${error.code}`);
            if (stdout) console.error(`[STDOUT]: ${stdout.trim()}`);
            if (stderr) console.error(`[STDERR]: ${stderr.trim()}`);
            
            // Se falhou por conflito ou algo grave, talvez queiramos re-enfileirar os arquivos
            // mas por enquanto vamos apenas avisar.
            return;
        }
        
        if (stdout && stdout.includes('Updating')) {
           console.log(`📡 [NINJA SYNC] Atualizações remotas recebidas durante o pull.`);
        }

        console.log(`✅ [NINJA SYNC] GitHub Atualizado com Sucesso!`);
        if (stdout) console.log(`[GIT]: ${stdout.split('\n').filter(l => l.trim()).pop() || ''}`);
    });
}

// --- ENDPOINTS ---

// Retorna nomes live do state manager para os macros
router.get('/names', (req, res) => {
    const s = stateManager.getState();
    const names = {};
    // Inputs (0-31)
    for (let i = 0; i < 32; i++) {
        if (s.channels[i] && s.channels[i].name) {
            names[i] = s.channels[i].name;
        }
    }
    // Mixes (36-43)
    for (let i = 0; i < 8; i++) {
        if (s.mixes[i] && s.mixes[i].name) {
            names[36 + i] = s.mixes[i].name;
        }
    }
    // Buses (44-51)
    for (let i = 0; i < 8; i++) {
        if (s.buses[i] && s.buses[i].name) {
            names[44 + i] = s.buses[i].name;
        }
    }
    // Stereo (52)
    if (s.master && s.master.name) {
        names[52] = s.master.name;
    }
    res.json(names);
});

router.get('/macros/hosts', (req, res) => {
    const hostsPath = path.join(ROOT_DIR, 'public/modules/macros', 'hosts.json');
    if (fs.existsSync(hostsPath)) {
        res.json(JSON.parse(fs.readFileSync(hostsPath, 'utf8')));
    } else {
        res.json([
            { match: '192.168.15.99', preset: 'pcmaria' },
            { match: 'pcfavela', preset: 'pcfavela' }
        ]);
    }
});

router.get('/macros', (req, res) => {
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros');
    if (!fs.existsSync(macrosDir)) fs.mkdirSync(macrosDir, { recursive: true });
    fs.readdir(macrosDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao listar mods' });
        const jsFiles = files
            .filter(f => f.endsWith('.js') && !f.includes('.server.js') && f !== 'core.js' && f !== 'macros.js')
            .map(f => f.replace('.js', ''));
        res.json(jsFiles);
    });
});

router.get('/macros/slots', (req, res) => {
    const preset = req.query.preset;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localDir = path.join(macrosDir, 'local');
    const sharedDir = path.join(macrosDir, 'shared');

    if (preset) {
        const localPath = path.join(localDir, `profile_${preset}.json`);
        const sharedPath = path.join(sharedDir, `profile_${preset}.json`);
        if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
        if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
        return res.json({});
    } else {
        const profiles = {};
        const scan = (dir) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(f => {
                    if (f.startsWith('profile_') && f.endsWith('.json')) {
                        profiles[f.replace('profile_', '').replace('.json', '')] = true;
                    }
                });
            }
        };
        scan(sharedDir);
        scan(localDir);
        if (Object.keys(profiles).length === 0) profiles['default'] = true;
        res.json(profiles);
    }
});

router.post('/macros/slots', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const syncShared = req.query.syncShared === 'true';
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', `profile_${preset}.json`);
    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);

    try {
        const content = JSON.stringify(req.body, null, 2);
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);

        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            gitSyncMessage = `auto-sync: profile '${preset}' updated from ${os.hostname()}`;
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000);
        }
        res.json({ success: true, preset, synced: syncShared });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar perfil' });
    }
});

router.post('/macros/swap', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const fromIndex = parseInt(req.body.from);
    const toIndex = parseInt(req.body.to);
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');

    const handleSwap = (dir) => {
        const pPath = path.join(dir, `profile_${preset}.json`);
        if (fs.existsSync(pPath)) {
            try {
                let config = JSON.parse(fs.readFileSync(pPath, 'utf8'));
                const tFrom = config[fromIndex];
                const tTo = config[toIndex];
                delete config[fromIndex]; delete config[toIndex];
                if (tTo) config[fromIndex] = tTo;
                if (tFrom) config[toIndex] = tFrom;
                fs.writeFileSync(pPath, JSON.stringify(config, null, 2));
            } catch (e) {}
        }
    };

    handleSwap(path.join(macrosDir, 'local'));
    handleSwap(path.join(macrosDir, 'shared'));

    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);
    if (fs.existsSync(sharedPath)) {
        const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
        gitSyncQueue.add(relativeSharedPath);
        gitSyncMessage = `auto-sync: slots swapped in '${preset}' from ${os.hostname()}`;
        if (gitSyncTimer) clearTimeout(gitSyncTimer);
        gitSyncTimer = setTimeout(triggerGitSync, 10000);
    }

    res.json({ success: true });
});

// Força sincronização imediata dos arquivos compartilhados do preset
router.post('/macros/sync', express.json(), (req, res) => {
    const preset = req.query.preset;
    if (!preset) return res.status(400).json({ error: 'Preset faltando' });

    const sharedDir = path.join(ROOT_DIR, 'public/modules/macros/profiles/shared');
    if (!fs.existsSync(sharedDir)) return res.status(404).json({ error: 'Nenhum arquivo compartilhado encontrado' });

    const files = fs.readdirSync(sharedDir).filter(f => f.includes(`_${preset}.json`) || f === `profile_${preset}.json`);
    if (files.length === 0) return res.status(404).json({ error: 'Nenhum arquivo correspondente ao preset compartilhado' });

    files.forEach(f => {
        const full = path.join(sharedDir, f);
        const relativeSharedPath = path.relative(ROOT_DIR, full);
        gitSyncQueue.add(relativeSharedPath);
    });

    gitSyncMessage = `auto-sync: manual full sync for '${preset}' from ${os.hostname()}`;

    if (gitSyncTimer) clearTimeout(gitSyncTimer);
    // Trigger almost immediately
    gitSyncTimer = setTimeout(triggerGitSync, 500);

    res.json({ success: true, queued: files });
});

// Remove shared preset files for a given preset and enqueue removal for git
router.delete('/macros/sync', express.json(), (req, res) => {
    const preset = req.query.preset;
    if (!preset) return res.status(400).json({ error: 'Preset faltando' });

    const sharedDir = path.join(ROOT_DIR, 'public/modules/macros/profiles/shared');
    if (!fs.existsSync(sharedDir)) return res.status(404).json({ error: 'Nenhum arquivo compartilhado encontrado' });

    // Find matching files: either profile_<preset>.json or any file that includes _<preset>.json
    const files = fs.readdirSync(sharedDir).filter(f => f.includes(`_${preset}.json`) || f === `profile_${preset}.json`);
    if (files.length === 0) return res.status(404).json({ error: 'Nenhum arquivo correspondente ao preset compartilhado' });

    const deleted = [];
    files.forEach(f => {
        const full = path.join(sharedDir, f);
        try {
            if (fs.existsSync(full)) {
                fs.unlinkSync(full);
                deleted.push(f);
                const relativeSharedPath = path.relative(ROOT_DIR, full);
                // Ensure git will remove it in next sync
                gitSyncQueue.add(relativeSharedPath);
            }
        } catch (e) {
            console.error('[NINJA SYNC] Falha ao deletar arquivo compartilhado:', full, e.message);
        }
    });

    // Custom message for removal as requested by the user
    gitSyncMessage = `cloud-sync: profile '${preset}' removed from cloud by ${os.hostname()}`;

    if (gitSyncTimer) clearTimeout(gitSyncTimer);
    gitSyncTimer = setTimeout(triggerGitSync, 500);

    res.json({ success: true, deleted });
});

router.delete('/macros/slots', (req, res) => {
    const preset = req.query.preset;
    if (!preset || preset === 'default') return res.status(400).json({ error: 'Preset inválido ou protegido' });

    const localPath = path.join(ROOT_DIR, 'public/modules/macros/profiles/local', `profile_${preset}.json`);
    const sharedPath = path.join(ROOT_DIR, 'public/modules/macros/profiles/shared', `profile_${preset}.json`);

    try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath);
        res.json({ success: true, deleted: preset });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao deletar perfil' });
    }
});

router.get('/macros/config/:modId', (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
    if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
    res.json({});
});

router.post('/macros/config/:modId', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const syncShared = req.query.syncShared === 'true';
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    try {
        const content = JSON.stringify(req.body, null, 2);
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);

        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            gitSyncMessage = `auto-sync: mod config '${modId}' for '${preset}' updated from ${os.hostname()}`;
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000);
        }
        res.json({ success: true, mod: modId, preset, synced: syncShared });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar config do mod' });
    }
});

router.post('/macros/proxy/http', express.json(), async (req, res) => {
    const { url, options } = req.body;
    if (!url) return res.status(400).json({ error: 'URL inválida' });
    if (url.startsWith('file://')) return res.status(403).json({ error: 'Acesso a arquivos locais negado' });

    try {
        const response = await fetch(url, options);
        let rawData = await response.text();
        let data;
        try { data = JSON.parse(rawData); } catch (e) { data = rawData; }
        res.json({ status: response.status, data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/macros/proxy/udp', express.json(), (req, res) => {
    const dgram = require('dgram');
    const { host, port, data } = req.body;
    if (!host || !port || !data) return res.status(400).json({ error: 'Dados UDP incompletos' });

    const client = dgram.createSocket('udp4');
    const message = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));

    client.send(message, port, host, (err) => {
        client.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
