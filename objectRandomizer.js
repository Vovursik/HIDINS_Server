function generateRandomNumbers(n) {
    const numbers = [];
    for (let i = 0; i < n; i++) {
        const randomNumber = Math.floor(Math.random() * 20);  // Генерируем случайное число от 0 до 19
        numbers.push(randomNumber);
    }
    return numbers;
}