const path = require('path');
const fs = require('fs');
const filePath = path.join(__dirname, '../data/items.json');
let items = null;

fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return;
    try {
        items = JSON.parse(data).items;
    } catch {
        return;
    }
})

function randomNumbers(count) {
    const numbers = Array.from({ length: count + 1}, (_, i) => i);

    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
}

function getRandomData(max, pos) {
    let objects = randomNumbers(Object.keys(items).length-1);
    let points = randomNumbers(pos);

    objects = objects.slice(0, max);
    points = points.slice(0, max);
    found = new Set(objects);

    return {items : {objects, points}, found}
}

module.exports = { getRandomData };