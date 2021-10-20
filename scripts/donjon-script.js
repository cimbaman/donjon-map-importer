const WALL_OFFSET = 0.25;

const NOT_ROOMS = [0, 16];
const DOORS = [65540, 2097156, 262148, 524292, 1048580, 131076];

// The DonJonMap class
export class DonJonMap {
    // Button to open UI to import a dungeon
    importButton;

    importButtonClicked() {
        console.log("DonJonMap | importButtonClicked");
        let form = new DonJonMapForm({});
        form.render(true);
    }
}

class DonJonMapForm extends FormApplication {
    constructor(options) {
        super(options);
        console.log("DonJonMap | DonJonMapForm constructor");
    }

    // overrides superclass
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.title = "DonJonMap Import Scene";
        options.template = "modules/donjon-map-importer/templates/donjon-form.html";
        options.width = 350;
        options.height = "auto";
        options.editable = true;


        return options;
    }

    // must override - abstract function
    _updateObject(event, formData) {
        const promiseResult = new Promise(async (resolve, reject) => {

            let validData = true;
            formData.grid = 50;

            if(formData.name === ""){
                ui.notifications.error("Must eneter Scene name");
                validData = false;
            };

			const fileList = $("#donjon-map-json")[0].files;

			if (fileList.length != 1) {
                ui.notifications.error("Must import a JSON file");
                validData = false;
            } else {
                await readTextFromFile(fileList[0]).then(json => formData.json = json);
            }

            await $.get(formData.img).fail( () => {
                ui.notifications.error("Background Image file not found");
                validData = false;
            });

            if (validData) {
                try {
                    this.updateScene(formData);
                    ui.notifications.info("Imported Scene");
                    resolve("Imported Scene");
                } catch (error) {
                    reject(error);
                }
            } else {
                reject("Form data is not valid. See error notifications.");
            }
        });
        return promiseResult;
    }

    async updateScene(formData) {
        const loader = new TextureLoader();
        const texture = await loader.loadTexture(formData.img);

        let data = await JSON.parse(formData.json);
        let map = new MatrixMap();

		map.addRooms(data["cells"]);

        try {
            const newScene = await Scene.create({
                name: formData.name == "" ? "TEST" : formData.name,
                grid: formData.grid,
                img: formData.img,
                height: texture.height,
                width: texture.width,
                padding: 0,
                fogExploration: true,
                tokenVision: true,
            });
            let g = formData.grid;
            let walls = map.getProcessedWalls().map(m => m.map(v => v*g)).map(m => { return {c : m} });


        console.log(map.matrix);

            let doors = map.doors.flatMap(d => doorToWall(d, map.matrix));


            doors = doors.map(d => {
                d["c"] = d["c"].map(v => v*g);
                return d;
            });

            // Creates all the walls
            walls = walls.concat(doors);


            await newScene.createEmbeddedDocuments("Wall", walls, {noHook: false});

        } catch (error) {
            ui.notifications.error(error);
            console.log("DonJonMap | Error creating scene");
        }

    }

}

class MatrixMap {
    // for fast checking
    matrix;
    // for fast iterating
    list;
    //x,y,direction,type
    doors;

    constructor() {
        this.matrix = {};
        this.list = [];
        this.doors = [];
    }

    get(x, y) {
        return this.matrix[x] && this.matrix[x][y];
    }

    put(x, y) {
        if (!this.matrix[x]) {
            this.matrix[x] = {};
        }
        this.matrix[x][y] = true;
        this.list.push([x, y]);
    }

    addRect(rect) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            for (let y = rect.y; y < rect.y + rect.h; y++) {
                this.put(x, y);
            }
        }
    }

	addRooms(cells) {

		for(let i = 0; i < cells.length; i++){
			for(let j = 0; j < cells[i].length; j++){
				if(NOT_ROOMS.indexOf(cells[i][j]) == -1) this.put(j, i);
                if(DOORS.indexOf(cells[i][j]) != -1 ) this.doors.push([j,i,0,cells[i][j]]);
			}
		}  
    }

    getWalls() {
        let walls = [];
        this.list.forEach(p => {
            let x = p[0];
            let y = p[1];

            if (!this.get(x, y-1)) {
                walls.push([x, y, x+1, y]);
            }

            if (!this.get(x, y+1)) {
                walls.push([x, y+1, x+1, y+1]);
            }

            if (!this.get(x-1, y)) {
                walls.push([x, y, x, y+1]);
            }

            if (!this.get(x+1, y)) {
                walls.push([x+1, y, x+1, y+1]);
            }
        });
        return walls;
    }

    getProcessedWalls() {
        let walls = this.getWalls();
        let keys = [[], []];
        let sorting = [{}, {}];
        walls.forEach(w => {
            if (w[1] == w[3]) {
                if (!sorting[0][w[1]]) {
                    sorting[0][w[1]] = [];
                    keys[0].push(w[1]);
                }
                sorting[0][w[1]].push(w);
            } else {
                if (!sorting[1][w[0]]) {
                    sorting[1][w[0]] = [];
                    keys[1].push(w[0]);
                }
                sorting[1][w[0]].push(w);
            }
        });

        let result = [];

        // Do for both x and y. For y, shift indexing points by 1
        for (let i = 0; i < 2; i++) {
            keys[i].forEach(k => {
                // Sort heap by starting time
                let heap = sorting[i][k];
                heap.sort((a, b) => a[i] > b[i] ? 1 : -1);
                // Add first element to the stack
                let stack = [];
                stack.push(heap[0]);
                heap.forEach(wall => {
                    if (wall[i] > stack[stack.length - 1][i+2]) {
                        // new wall starts after current segment ends, so push to stack
                        stack.push(wall);
                    } else if (stack[stack.length - 1][i+2] < wall[i+2]) {
                        // new wall is longer than current segment, so lengthen wall
                        stack[stack.length - 1][i+2] = wall[i+2];
                    } else {
                        // else wall is contained inside current segment
                    }
                });
                stack.forEach(wall => result.push(wall));
            });
        }

        // For every wall coordinate, offset it into the open space (away from the filled tiles)
        result.forEach((wall, index, list) => {
            for (let p = 0; p < 2; p++) {
                let x = wall[2 * p];
                let y = wall[2 * p + 1];

                // get grid:
                let subgrid = [[false, false], [false, false]];
                let parity = 0;
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        subgrid[i][j] = this.get(x-1 + i, y-1 + j);
                        if (subgrid[i][j]) {
                            parity += 1;
                        }
                    }
                }
                // if outside corner case, switch to equivalent inside corner case
                if (parity == 1) {
                    subgrid = [
                        [!subgrid[1][1], !subgrid[1][0]],
                        [!subgrid[0][1], !subgrid[0][0]],
                    ]
                }

                // find the inside corner to shift the wall toward
                let inside_corner = [];
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        if (!subgrid[i][j]) {
                            inside_corner = [i, j];
                        }
                    }
                }

                result[index][2 * p] = x + (inside_corner[0] == 0 ? -WALL_OFFSET : WALL_OFFSET);
                result[index][2 * p + 1] = y + (inside_corner[1] == 0 ? -WALL_OFFSET : WALL_OFFSET);
            }
        });

        return result;
    }

}

function checkRoom(roomRow, roomIndex){
    if(roomRow === undefined) return false;
    if(roomRow[roomIndex] === undefined)  return false;
    return roomRow[roomIndex];
}


// DOOR TYPES

const DOOR_ARCH = 65540;
const DOOR_PORTCULLIS = 2097156;
const DOOR_LOCKED = 262148; 
const DOOR_TRAP = 524292; 
const DOOR_SECRET = 1048580;
const DOOR_DOOR = 131076;

// Helper function that converts a JSON door input to a wall (in map grid coordinates)
function doorToWall(door, rooms) {
    let result = {};
    const offset = 0.75;
    // door
    // this.doors.push([j,i,0,cells[i][j]]);
    // rooms
    // this.matrix[x][y] = true;

    if(checkRoom(rooms[door[0]+1],door[1]) && checkRoom(rooms[door[0]-1],door[1])) door[2]=-1;
    else if(checkRoom(rooms[door[0]],door[1]+1) && checkRoom(rooms[door[0]],door[1]-1)) door[2]=1;


    if (door[2] == -1) result["c"] = [door[0], door[1]-offset,door[0], door[1]+offset];
    if (door[2] ==  1) result["c"] = [door[0]-offset, door[1],door[0]+offset, door[1]];

    result["c"] = result["c"].map(p => p + 0.5);



    result["door"] =  CONST.WALL_DOOR_TYPES.DOOR;

    if(door[3] == DOOR_ARCH) result["ds"] = CONST.WALL_DOOR_STATES.OPEN;
    if(door[3] == DOOR_LOCKED) result["ds"] = CONST.WALL_DOOR_STATES.LOCKED;
    if(door[3] == DOOR_TRAP) result["ds"] = CONST.WALL_DOOR_STATES.LOCKED;
    if(door[3] == DOOR_PORTCULLIS) {result["ds"] = CONST.WALL_DOOR_STATES.LOCKED; result["sense"] = CONST.WALL_SENSE_TYPES.NONE;}
    if(door[3] == DOOR_SECRET) result["door"] = CONST.WALL_DOOR_TYPES.SECRET;


    return result;
}