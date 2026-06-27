// generate_training_data.js
const fs = require('fs');
const path = require('path');

const objects = {
    "ball1": ["green", "rough"],      "ball2": ["blue", "dull"],
    //"apple": ["red", "sweet"],        "banana": ["yellow", "soft"],
    //"car1": ["fast", "shiny"],        "car2": ["slow", "rusty"],
    "door1": ["heavy", "wooden"],     "door2": ["light", "metal"],
    "cloud1": ["white", "fluffy"],    "cloud2": ["gray", "thick"],
    //"pen1": ["black", "smooth"],      "pen2": ["blue", "grippy"],
    //"shoe1": ["red", "laced"],        "shoe2": ["white", "slip-on"],
    //"phone1": ["sleek", "black"],     "phone2": ["bulky", "silver"],
    //"cat1": ["orange", "fluffy"],     "cat2": ["gray", "sleek"],
    //"book1": ["thick", "hardcover"],  "book2": ["thin", "paperback"],
    //"cup1": ["ceramic", "white"],     "cup2": ["plastic", "blue"],
    //"tree1": ["tall", "leafy"],       "tree2": ["short", "bare"],
    //"lamp1": ["bright", "modern"],    "lamp2": ["dim", "vintage"],
    //"hat1": ["wool", "warm"],         "hat2": ["straw", "light"],
    //"key1": ["brass", "old"],         "key2": ["steel", "new"],
    //"rock1": ["smooth", "gray"],      "rock2": ["jagged", "brown"],
    //"fish1": ["gold", "shiny"],       "fish2": ["blue", "matte"],
    //"bag1": ["leather", "brown"],     "bag2": ["canvas", "green"],
    //"clock1": ["round", "analog"],    "clock2": ["square", "digital"],
    //"plant1": ["tall", "leafy"],      "plant2": ["short", "spiky"],
};

const objList = Object.keys(objects);
const lines = [];

// Generate all 40 × 40 = 1600 combinations
for (const a of objList) {
    for (const b of objList) {
        const [a1, a2] = objects[a];
        const [b1, b2] = objects[b];
        lines.push(`<|user|>${a} and ${b}<|assistant|> shows ${a} is ${a1} and ${a2} and ${b} is ${b1} and ${b2}<|stop|>`);
    }
}

const output = lines.join('\n') + '\n';
const outputPath = path.join(__dirname, 'training_data_1600.txt');

try {
    fs.writeFileSync(outputPath, output, 'utf-8');
    console.log(`✅ Successfully saved ${lines.length} examples to: ${outputPath}`);
} catch (err) {
    console.error(`❌ Failed to write file: ${err.message}`);
    process.exit(1);
}