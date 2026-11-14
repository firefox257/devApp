// utils.js
export function toHex(str) {
    if (!str) return "";
    return Array.from(str).map(c => 
        c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()
    ).join(' ');
}

export function toWasmHex(uint8Array) {
    if (!uint8Array || !(uint8Array instanceof Uint8Array)) return "N/A";
    const hex = [];
    for (let i = 0; i < uint8Array.length; i++) {
        hex.push(uint8Array[i].toString(16).padStart(2, '0').toUpperCase());
    }
    return hex.join(' ');
}