class Overworld {
    constructor(config){
        this.element = config.element;
        this.canvas = this.element.querySelector(".game-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.map = null;
        this.foundFrog2 = config.foundFrog2 || false;
        this.easterEggsFound = config.easterEggsFound || []; // Lista de easter eggs encontrados
        this.easterEggsFoundID = config.easterEggsFoundID || []; // Lista do id dos easter eggs encontrados
        this.playerState = {
            items: [ null, null, null, null, null, null ],
            storyFlags: {}, // Para eventos únicos, como "FALOU_COM_GALINHA_BRANCA"
            completedQuests: new Set(), // Um conjunto de IDs de quests já completadas
            currentQuestId: "Q1", // Começa com a primeira quest
            questFlags: {}
        };
        this.audioManager = new Audio();
        this.level = 1;
        this.coins = 100;
    }

    addItemToHotbar(itemToAdd) {
        let added = false;
        // 1. Tenta empilhar com um item existente
        for (let i = 0; i < this.playerState.items.length; i++) { // Alterado de playerHotbar para playerState.items
            const slot = this.playerState.items[i];
            if (slot && slot.id === itemToAdd.id) {
                slot.quantity += itemToAdd.quantity;
                added = true;
                break;
            }
        }
        // 2. Se não empilhou, procura um slot vazio
        if (!added) {
            for (let i = 0; i < this.playerState.items.length; i++) { // Alterado de playerHotbar para playerState.items
                if (this.playerState.items[i] === null) {
                    this.playerState.items[i] = itemToAdd;
                    added = true;
                    break;
                }
            }
        }

        if (added) {
            // 3. Sincroniza a HUD com o novo estado do inventário
            this.playerState.items.forEach((item, i) => { // Alterado de playerHotbar para playerState.items
                this.hud.updateHotbarSlot(i, item);
            });
        } else {
            console.log("Hotbar cheia! Não foi possível adicionar o item.");
        }
    }

    // Método principal para verificar o progresso da quest
    checkForQuestCompletion() {
        const questId = this.playerState.currentQuestId;
        if (!questId) return; // Se não houver quest ativa, não faz nada.

        // Encontra a quest atual na lista de quests
        const quest = window.QuestList.find(q => q.id === questId);
        if (!quest) return;

        // Chama a função de verificação da quest
        if (quest.checkCompletion(this.playerState)) {
            console.log(`Quest ${quest.name} completada!`);
            
            // Marca como completa e avança para a próxima
            this.playerState.completedQuests.add(questId);
            const currentQuestIndex = window.QuestList.findIndex(q => q.id === questId);
            const nextQuest = window.QuestList[currentQuestIndex + 1];
            this.playerState.currentQuestId = nextQuest ? nextQuest.id : null;

            // --- LÓGICA DE NÍVEL ADICIONADA AQUI ---
            this.level += 1; // Aumenta o nível do jogador
            this.hud.updateLevel(this.level); // Atualiza a HUD com o novo nível

            // Entrega a recompensa
            if (quest.reward) {
                if (quest.reward.type === "item") {
                    this.addItemToHotbar(quest.reward.item);
                }
                if (quest.reward.type === "coins") {
                    this.coins += quest.reward.amount;
                    this.hud.updateCoins(this.coins);
                }
            }
            
            // Atualiza a HUD
            this.hud.updateTasks(this.playerState.currentQuestId, this.playerState);
        }
    }

    startGameLoop() { // loop principal do jogo, responsável por atualizar e redesenhar tudo em cada quadro
        const step = () => {

            //Clear off the canvas
            this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height); // Limpa todo o canvas para desenhar o próximo

            //Estibiliza a camera no personagem
            const cameraPerson = this.map.gameObjects.hero;

            //Atualiza todos os objetos
            Object.values(this.map.gameObjects).forEach(object => {
                object.update({
                    arrow: this.directionInput.direction,
                    map: this.map,
                })
            })

            // Desenha a layer de baixo
            this.map.drawLowerImage(this.ctx, cameraPerson);

            //Desenha os objetos do jogo
            Object.values(this.map.gameObjects).sort((a, b) => {
                return a.y - b.y; // os personagens que estão mais ao norte vão renderizar primeiro
            }).forEach(object => {
                object.sprite.draw(this.ctx, cameraPerson);
            })

            // Desenha a layer de cima
            this.map.drawUpperImage(this.ctx, cameraPerson);
         
            requestAnimationFrame(() => {
                step();
            })
        }
        step();
    }

    bindHeroPositionCheck() {
        document.addEventListener("PersonWalkingComplete", e => {
            if (e.detail.whoId === "hero") {
                // Quer dizer que a posição do pinguim mudou
                this.map.checkForFootstepCutscene();
            }
        })
    }

    frogsFoundCheck() { // Serve para ver se foi encontrado um sapo
        document.addEventListener("FrogWasFound", e => {
            if (e.detail.whoId === "frog1" && this.map.name === "Galinheiro") {
                this.foundFrog1 = true;
            }
            if (e.detail.whoId === "frog2" && this.map.name === "Galinheiro") {
                this.foundFrog2 = true;
            }
            if (e.detail.whoId === "frog3" && this.map.name === "Galinheiro") {
                this.foundFrog3 = true;
            }
        })
    }

    bindActionInput() {
        new KeypressListener("KeyE", () => {
            const hero = this.map.gameObjects.hero;
            const npc = hero.currentInteractingNpc;

            if (npc && !this.map.isCutscenePlaying) {
                // Se o NPC tem eventos de quest, inicia a cutscene
                if (npc.talking && npc.talking.length > 0) {
                    this.map.startCutscene(npc.talking[0].events);
                } else {
                    // Senão, usa o DialogManager para diálogos simples
                    if (!this.map.dialogManager) {
                        this.map.dialogManager = new DialogManager();
                    }

                    // Condição especial para a galinha da loja
                    if (npc.id === "galinhaPenosa") {
                        this.map.dialogManager.startDialog(npc.id, this.map, () => {
                            // Esta função será chamada QUANDO o diálogo terminar
                            openShop(); 
                        });
                    } else {
                        // Para todos os outros NPCs simples
                        this.map.dialogManager.startDialog(npc.id, this.map);
                    }
                }
            }
        });
    }

    easterEggsFoundCheck() { // Método que vê se algum easter-egg foi encontrado
        document.addEventListener("EasterEggWasFound", e => {
            if (!this.easterEggsFound.includes(e.detail.whoId)) { // Se não tiver esse easter-egg na lista
                this.easterEggsFound.push(e.detail.whoId); // Inclui ele na lista de easter eggs encontrados
                this.hud.updateEasterEggs(this.easterEggsFound); // Atualiza a listagem de easter eggs na hud

                this.audioManager.playEasterEggSound();
            }
        })
        document.addEventListener("EasterEggWasFoundID", e => {
            if (!this.easterEggsFoundID.includes(e.detail.whoId)) { // Se não tiver esse easter-egg na lista
                this.easterEggsFoundID.push(e.detail.whoId); // Inclui ele na lista de easter eggs encontrados
            }
        })
    }

    startMap(mapConfig) {
        this.frogsFoundCheck(); // Ve se os sapos já foram encontrados
        this.easterEggsFoundCheck();
        this.map = new OverworldMap(mapConfig, { // Passa os valores de foundFrog
            foundFrog1: this.foundFrog1,
            foundFrog2: this.foundFrog2,
            foundFrog3: this.foundFrog3,
            easterEggsFound: this.easterEggsFound, // Passa a lista do nome de easter-eggs encontrados
            easterEggsFoundID: this.easterEggsFoundID, // Passa a lista do id dos de easter-eggs encontrados
        });
        this.map.overworld = this;
        
        this.map.mountObjects();
    }

    init() {
        this.hud = new Hud();
        this.hud.init(document.querySelector(".game-container"));
        
        this.audioManager.startSoundtrack();
        this.hud.updateTasks(this.playerState.currentQuestId, this.playerState);
        this.hud.updateLevel(this.level);
        this.hud.updateCoins(this.coins);

        this.startMap(window.OverworldMaps.Galinheiro);

        this.directionInput = new DirectionInput(); // gerencia as entradas do teclado para o movimento do personagem
        this.directionInput.init();
        //this.directionInput.direction;

        this.bindHeroPositionCheck();
        this.bindActionInput();

        this.startGameLoop(); // inicia o loop principal do jogo

        // Inicializa o sistema de moedas e níveis
        // this.coins = 100;
        // this.hud.updateCoins(this.coins); // Atualiza a HUD com as moedas iniciais

        // this.level = 1;
        // this.hud.updateLevel(this.level);
    }
}