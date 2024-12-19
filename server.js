const WebSocket = require("ws");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
require("dotenv").config();

const objectRandomizer = require("./utils/objectRandomizer.js");

console.clear();

const serverPort = process.env.SERVER_PORT;
const webSocket = new WebSocket.Server({ port: serverPort });

console.log(
  "\x1b[90m%s\x1b[0m",
  `|> Websocket listening on: localhost:${serverPort}`
);

const sessions = new Map();
const clientIndex = new Map();

const clientWs = new Map();
let clientsCount = 0;

let waitingQueue = [];

webSocket.on("connection", (ws, req) => {
  console.log("\x1b[90m%s\x1b[0m", "|> New client connected.");
  clientsCount += 1;

  const clientId = uuidv4();
  console.log("\x1b[32m%s\x1b[0m", "|> Generated clientId:", clientId);

  clientWs.set(clientId, ws);

  ws.send(
    JSON.stringify({
      connect: clientId,
    })
  );

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      var session = null;

      switch (parsedMessage.type) {
        case "action":
          session = findSessionByClientId(clientId);
          if (
            parsedMessage.description === "add_to_waiting_queue" &&
            !waitingQueue.includes(clientId) &&
            !session
          ) {
            console.log("session",session)
            waitingQueue.push(clientId);
            console.log(
              "\x1b[90m%s\x1b[0m",
              "|+ Client add to waiting queue:",
              clientId
            );
            checkQueue();
          }
          if (
            parsedMessage.description === "delete_from_waiting_queue" &&
            waitingQueue.includes(clientId) &&
            !session
          ) {
            const index = waitingQueue.indexOf(clientId);
            if (index !== -1) {
              waitingQueue.splice(index, 1);
              console.log(
                "\x1b[90m%s\x1b[0m",
                "|- Client remove from waiting queue:",
                clientId
              );
            }
          }
          if (parsedMessage.description === "get_session_objects" && session) {
            ws.send(
              JSON.stringify({
                generate: session.data.items,
              })
            );
            console.log(
              "\x1b[33m%s\x1b[0m %s\x1b[33m %s\x1b[0m",
              "|-> Send object data of:",
              session.session_id,
              "to client:",
              clientId
            );
            //После генериации предметов у клинетов инициализируем инвентарь
            console.log(session.data.found)

            //Инициализируем счёт у каждого клиента
            pointsInit(clientId);

            //Инициализируем таймер для этой сессии
            startSessionTimer(session);
          }

          if (parsedMessage.description == "menu_button_pressed" && session) {
            const client = session.clients.find(
                (client) => client.client_id === clientId
            );
        
            const otherClient = session.clients.find(
                (client) => client.client_id !== clientId
            );
        
            if (otherClient) {
                const currentWs = clientWs.get(otherClient.client_id);
                console.log(otherClient);
                if (currentWs) {
                    currentWs.send(
                        JSON.stringify({
                            menu_pressed: true,
                        })
                    );
                }
        
                // Завершаем сессию
                if (session) {
                    removeSession(otherClient.client_id);
                    client.ready = false
                    otherClient.ready = false
                }
            }
        }
        

          if (parsedMessage.description == "hints_end" && session) {
            const client = session.clients.find(
                (client) => client.client_id === clientId
            );
            if (client.ready != true) {
                client.ready = true;
                var f = true;
                session.clients.forEach((client) => {
                    if (client.ready == false) 
                    f = false;
                    console.log(client.ready);
                });

                if (f) {
                    session.clients.forEach((client) => {
                    const currentWs = clientWs.get(client.client_id);
                    currentWs.send(
                      JSON.stringify({
                          hints_read: true
                      })
                    );
                  
                    currentWs.send(
                        JSON.stringify({
                          generate: session.data.items

                        })
                      );
                    })
                    updateInventoryState(clientId); 

                    //После генериации предметов у клинетов инициализируем инвентарь
                    console.log(session.data.found)

                    //Инициализируем счёт у каждого клиента
                    pointsInit(clientId);

                    //Инициализируем таймер для этой сессии
                    startSessionTimer(session);

                };
            }
        }
          break;
      
        case "object":
          session = findSessionByClientId(clientId);
          if (session && session.data.found.has(parsedMessage.id)) {
            session.data.found.delete(parsedMessage.id);

            session.clients.forEach((client) => {
              const currentWs = clientWs.get(client.client_id);
              //Посылаем сообщения с удалением для игрока и тиммейта
              if (currentWs == ws) {
                ws.send(
                  JSON.stringify({
                    delete: parsedMessage.id,
                    message: "you_pick_item",
                  })
                );
                console.log(
                  "\x1b[33m%s\x1b[0m %s\x1b[33m %s\x1b[0m %s\x1b[33m %s\x1b[0m",
                  "|! Found object with id:",
                  parsedMessage.id,
                  "in session:",
                  session.session_id,
                  "by client:",
                  clientId
                );

                //Начисляем очки этому игроку
                addPointsToPlayer(client.client_id);
              } else {
                currentWs.send(
                  JSON.stringify({
                    delete: parsedMessage.id,
                    message: "you_teammate_pick_item",
                  })
                );
              }
            });
            //Проверка что found не пустой
            if (session.data.found.size == 0) {
              //Завершаем таймер
              session.status = "finished";

              sendPlayersScore(clientId, false);
              removeSession(clientId);
              break;
              //   console.log("ПРЕДМЕТЫ НАЙДЕНЫ");
            }
            //Обновление инвентаря после удаления на клиентах
            updateInventoryState(clientId);
          }
          break;
      }
    } catch (error) {
      console.error("Error parsing JSON:", error);
    }
  });

  ws.on("close", () => {
    clientWs.delete(clientId);
    const index = waitingQueue.indexOf(clientId);
    if (index !== -1) {
      waitingQueue.splice(index, 1);
      console.log(
        "\x1b[90m%s\x1b[0m",
        "|- Client remove from waiting queue:",
        clientId
      );
    }
    removeSession(clientId);
    console.log("\x1b[31m%s\x1b[0m", "|> Client disconnected:", clientId);
  });
});

// Функция для запуска таймера с тиками

function startSessionTimer(session) {
  //Объявляем начало сессии в переменной, !!!только если не пуста!!!
  if (session.status == null) {
    session.status = "started";

    const tickInterval = 1000; //Каждый тик 1 секунда
    const maxTicks = 60; //180 тиков = 3 минуты
    let tickCount = 0; //Текущее время

    interval = setInterval(() => {
      //Проверяем не заврешена ли сессия преждевременно, если да то прерываем выполнение
      if (session.status == "finished" || !session) {
        return;
      }

      tickCount++; // Увеличиваем количество тиков
    //   console.log("ПРОИЗОШЁЛ ТИК");
    //   console.log(`Тик №${tickCount}`);

      //   // Выполняем действия при каждом новом тике (например, проверка условий)
      //   if (tickCount === 5) {
      //     console.log('Запуск действия на 5-м тике!');
      //     // Здесь можно выполнить какое-либо действие (например, вывести уведомление или изменить состояние)
      //   }

      // Останавливаем таймер после достижения максимального числа тиков
      if (tickCount >= maxTicks) {
        clearInterval(interval);
        if (session) {
          session.status = "finished";
          sendPlayersScore(session, true);
          removeSession(session, true);
        }
        console.log(`Таймер завершён. Всего тиков: ${tickCount}`);
      }
    }, tickInterval); // Интервал между тиками (в миллисекундах)

    return true; //Завершение таймера
  }
  return;
}

//Обновление состояния инвентаря
function updateInventoryState(clientId) {
  //Сессия
  session = findSessionByClientId(clientId);
  //Состояние инвентаря
  found_state = session.data.found;
  //   console.log("FOUND_STATE");
  //   console.log(found_state);
  session.clients.forEach((client) => {
    const currentWs = clientWs.get(client.client_id);
    //Высылаем found всем игрокам внутри сессии
    currentWs.send(
      JSON.stringify({
        inventory: Array.from(found_state), // Конвертируем Set в массив иначе будет пустота
        message: "inventory_list_update",
      })
    );
  });
}

// Инициализация очков у игроков
function pointsInit(clientId) {
  const session = findSessionByClientId(clientId); // Найти сессию клиента
  if (!session) {
    console.error(`Сессия для клиента ${clientId} не найдена`);
    return;
  }

  try {
    const client = session.clients.find(
      (client) => client.client_id === clientId
    ); // Найти клиента в сессии
    if (!client) {
      console.error(`Клиент с ID ${clientId} не найден в сессии`);
      return;
    }

    // Добавить очки
    client.score = 0;
  } catch (error) {
    console.error(
      `Ошибка при инициализации очков для клиента ${clientId}:`,
      error
    );
  }
}

// Начисление игроку очков за подбор
function addPointsToPlayer(clientId) {
  const session = findSessionByClientId(clientId); // Найти сессию клиента
  if (!session) {
    console.error(`Сессия для клиента ${clientId} не найдена`);
    return;
  }

  try {
    const client = session.clients.find(
      (client) => client.client_id === clientId
    ); // Найти клиента в сессии
    if (!client) {
      console.error(`Клиент с ID ${clientId} не найден в сессии`);
      return;
    }

    // Добавить очки
    client.score = (client.score || 0) + 20;
    console.log(
      `Клиенту ${clientId} начислено 20 очков. Текущий счет: ${client.score}`
    );
  } catch (error) {
    console.error(
      `Ошибка при начислении очков для клиента ${clientId}:`,
      error
    );
  }
}

//Выслать счёт игрокам
function sendPlayersScore(data, isSession) {
  //Сессия
  if (!isSession) session = findSessionByClientId(data);
  else session = data;
  //Состояние инвентаря
  found_state = session.data.found;
  session.clients.forEach((client) => {
    const currentWs = clientWs.get(client.client_id);
    //Высылаем очки всем игрокам внутри сессии
    let scores = 0
    if (client.score) scores = client.score;
    currentWs.send(
      JSON.stringify({
        score: scores, // Конвертируем Set в массив иначе будет пустота
        message: "score_send",
      })
    );
  });
}

function checkQueue() {
  while (waitingQueue.length >= 2) {
    const client1 = waitingQueue.shift();
    const client2 = waitingQueue.shift();
    console.log(
      "\x1b[90m%s\x1b[0m",
      "|- Client remove from waiting queue:",
      client1
    );
    console.log(
      "\x1b[90m%s\x1b[0m",
      "|- Client remove from waiting queue:",
      client2
    );

    sessionId = uuidv4();
    addSession(sessionId, client1, client2);

    const client1Socket = clientWs.get(client1);
    const client2Socket = clientWs.get(client2);

    if (client1Socket) {
      client1Socket.send(
        JSON.stringify({
          action: "start_session",
          session: sessionId,
        })
      );
    }
    if (client2Socket) {
      client2Socket.send(
        JSON.stringify({
          action: "start_session",
          session: sessionId,
        })
      );
    }
  }
}

function addSession(sessionId, client1, client2) {
  const sessionData = {
    session_id: sessionId,
    start_time: new Date().toISOString(),
    clients: [{ client_id: client1, ready: false }, { client_id: client2, ready: false }],
    data: objectRandomizer.getRandomData(10, 22),
  };

  // console.log(sessionData);

  sessions.set(sessionId, sessionData);
  clientIndex.set(client1, sessionData);
  clientIndex.set(client2, sessionData);
  console.log("\x1b[36m%s\x1b[0m", "|+ Session created:", sessionId);
}

function removeSession(data, isSession = false) {
  let session = null
  if (!isSession)
    session = findSessionByClientId(data);
  else 
    session = data;
  
  if (session) {
    console.log("session", session);
    session.status = "finished"; // Завершаем сессию

    // Сбрасываем готовность клиентов, чтобы они могли добавить себя в очередь
    session.clients.forEach((client) => {
      clientIndex.delete(client.client_id); // Удаляем из клиентского индекса
    });

    const sessionId = session.session_id; // Необходимо сохранить sessionId для удаления
    sessions.delete(sessionId); // Удаляем сессию из глобального объекта
    console.log("\x1b[35m%s\x1b[0m", "|- Session deleted:", sessionId);
  }
}


function findSessionByClientId(clientId) {
  return clientIndex.get(clientId) || null;
}
