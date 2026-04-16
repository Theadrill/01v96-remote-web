const MidiScheduler = require('../src/midi-scheduler');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    const sent = [];
    const fakeEngine = { send: (msg) => { sent.push(msg); } };

    const sched = new MidiScheduler(fakeEngine);
    sched.tickMs = 2;
    sched.start();

    const p1 = [0xF0,0x43,0x10,0x00,0x01,0x02,0xF7];
    const p2 = [0xF0,0x43,0x10,0x00,0x05,0x06,0xF7];

    console.log('Enfileirando P1 (priority 1)');
    sched.enqueue(p1, 1);

    console.log('Tentando enfileirar P2 (priority 2) — deve falhar enquanto q1 tiver itens');
    const acceptedWhileQ1 = sched.enqueue(p2, 2);
    console.log('P2 aceito imediatamente?', acceptedWhileQ1);

    // Aguarda alguns ticks para processar P1
    await sleep(50);

    console.log('Stats após processamento inicial:', sched.getStats());

    console.log('Tentando enfileirar P2 novamente — agora deve ser aceito');
    const acceptedAfter = sched.enqueue(p2, 2);
    console.log('P2 aceito agora?', acceptedAfter);

    // Aguarda processamento de P2
    await sleep(50);

    console.log('Pacotes enviados ao fakeEngine:', sent.length);
    console.log('Sent contents:', sent.map(s => s.slice(0,7)));
    console.log('Stats finais:', sched.getStats());

    sched.stop();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
