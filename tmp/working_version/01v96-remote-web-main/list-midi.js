const midi = require('midi');

// Input list
const input = new midi.Input();
console.log('--- INPUTS ---');
for (let i = 0; i < input.getPortCount(); i++) {
    console.log(`[${i}] ${input.getPortName(i)}`);
}
input.closePort();

// Output list
const output = new midi.Output();
console.log('\n--- OUTPUTS ---');
for (let i = 0; i < output.getPortCount(); i++) {
    console.log(`[${i}] ${output.getPortName(i)}`);
}
output.closePort();
