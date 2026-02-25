class GridSystem {
    constructor(matrix, playerX, playerY, outlineWidth, baseColor, jointWallMax, maxPoints, maxAttacks) {
        this.maxPoints = maxPoints
        this.maxAttacks = maxAttacks
        this.matrix = matrix;
        this.teamMatrix = Array(this.matrix.length).fill().map(() => new Array(this.matrix[0].length).fill(0));
        this.aliveMatrix = Array(this.matrix.length).fill().map(() => new Array(this.matrix[0].length).fill(0));
        this.splitsMatrix = Array(this.matrix.length).fill().map(() => new Array(this.matrix[0].length).fill(0));
        // SplitsMatrix recoge donde hay bifurcaciones 1, máximos 2, finales de camino 3 en aliveMattrix
        this.cellSize = 40;
        this.padding = 2;
        this.UIw = outlineWidth+ (this.cellSize + this.padding)*this.matrix[0].length - (this.padding)
        this.UIh = outlineWidth+ (this.cellSize + this.padding)*this.matrix.length - (this.padding)
        this.uiContext = this.#getContext(this.UIw,this.UIh,"#000")
        this.outlineContext = this.#getContext(0,0,"#444")
        this.topContext = this.#getContext(0,0,"#111", true)
        this.player = {x: playerX,y: playerY,color: "orange"};
        this.bases = 2;
        this.baseColor = baseColor;
        this.matrix[playerY][playerX] = 2;
        this.team = 0;
        this.pVal = 1;
        this.points = 0;
        this.mode = "Placing bases" 
        this.blockChain = Array(Math.ceil((1/2)*this.matrix.length*this.matrix[0].length)).fill().map(() => new Array(3).fill(0));
        this.playerHidden = false
        this.jointWallMax = jointWallMax;
        this.BifurcationIndices = [];
        this.attacks = 0;
        this.globalBifurcationIndex = 0
        
        //Debug variables
        this.debug = false
        this.lastAVal = 1

        document.addEventListener("keydown", this.ChangePlayerMovement);
        document.addEventListener("keydown", this.PlayerStory);
    }

    // Sorteamos limitaciones de JS

    #listToKey(list) {
        return JSON.stringify(list);
    }
    
    //BOOLEANAS y CASUÍSTICA

    #isValidMove(x, y){
        if ((0<this.player.y+y<this.matrix.length-1)&&(0<this.player.x+x<this.matrix[0].length-1)){
            const playerWant = this.matrix[this.player.y + y][this.player.x +x]
            if (playerWant != 0){
                return true;
            }
        }
        return false;
    }

    #isAlone(x, y){
        for (let up=-1;up<2;up++){
        for (let right=-1;right<2;right++){
            if (up===0 && right===0){
                if (this.pVal != 1){
                    return false
                }
                continue;
            }
            if (this.matrix[y+up][x + right] != 1){
                return false
            }
            }
        }
        return true
            
    }

    #isValidPlacement(x,y,team,radar=true) {
        for (let up=-1;up<2;up++){
            for (let right=-1;right<2;right++){
                if (this.teamMatrix[y+up][x+right] != 0 && this.teamMatrix[y+up][x+right] != team  ){
                    return false
                }
            }
        }
        return this.#hasShortChain(false,0,y,x,this.aliveMatrix,team,this.aliveMatrix,true,1,0,radar)[1]
    }

    #surroundings(x,y,team,Aignore=0,useTeams=true,isAlive=true,radar=true,Amatrix=this.aliveMatrix,useB=true,BIgnore=[0,1],Bmatrix=this.matrix){
        let Surroundings = []
        for (let up = -1; up<2; up ++){
            for (let right = -1; right<2; right ++){
                if (up === 0 && right === 0  || (useB && BIgnore.includes(Bmatrix[y+up][x+right])) || (useTeams && this.teamMatrix[y+up][x+right]!=team) || (isAlive && Amatrix[y+up][x+right]==Aignore)) continue;
                Surroundings.push([x+right,y+up])
            }
        }
        if (radar && useTeams){
            const radarList = this.#radarAvailable(x,y,team)
            Surroundings = Surroundings.concat(radarList)
            if (this.matrix[y][x]==8){
                for (let up = Math.max(-3,-y); up<Math.min(4,totalRows - y); up ++){
                    for (let right = Math.max(-3,-x); right<Math.min(4,totalColumns-x); right ++){
                        if (this.teamMatrix[y+up][x+right] == team){
                            Surroundings.push([x+right,y+up]);
                        }
                    }
                }
            }
        }
        return Array.from(new Set(Surroundings.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
    }
    
    #isWall(y,x,team){ // Team se refiere a "si no es de mi equipo"
        return (((this.matrix[y][x] === 5) && (this.teamMatrix[y][x] != team)) || (this.matrix[y][x] === 7));
    }

    #isValidWall(x,y,jWMx = jointWallMax){
        const count = this.#countJoint(x,y,this.matrix,[5,7])
        return [count.length < jWMx + 1,count.length]
    }

    #turretAvailable(x,y,team){
        let bool = false;
        for (let up = Math.max(-5,-y); up<Math.min(6,totalRows - y); up ++){
            for (let right = Math.max(-5,-x); right<Math.min(6,totalColumns-x); right ++){
                if ((this.matrix[y+up][x+right] === 6) && (this.teamMatrix[y+up][x+right] === team)){
                    if (this.#hasClearRay(x+right,y+up,x,y,team)){
                        bool = true;
                    } 
                }
            }
        }
        return bool;
    }

    #radarAvailable(x,y,team,bool = false){ //Consider having a matrix for this?
        let radarList = []
        for (let up = Math.max(-3,-y); up<Math.min(4,totalRows - y); up ++){
            for (let right = Math.max(-3,-x); right<Math.min(4,totalColumns-x); right ++){
                if (this.matrix[y+up][x+right] == 8 && this.teamMatrix[y+up][x+right] == team){
                    radarList.push([x+right,y+up]);
                }
            }
        }
        if (bool){
            return (radarList.length > 0)
        }
        return radarList;
    }

    #hasClearRay(xo,yo,xf,yf,team,giveRay=false){ // Escoger cuál es f y cuál es o importa, el código debe considerar si hay un camino recto entre el centro del cuadrado xo,yo a una esquina de xf,yf sin pasar por una muralla//
        const h=Math.abs(yf-yo)
        const w=Math.abs(xf-xo)
        let bool = true;
        let latticeMatrix = Array(h + 2).fill().map(() => Array(w + 2).fill(0));
        for (let down = -1; down<2; down ++){
            for (let right = -1; right<2; right ++){
                if (down*right == 0) continue;
                bool = true
                //Recalcula la lattice
                for (let y = 0; y < h+2; y ++){
                    for (let x = 0; x < w+2; x ++){
                        latticeMatrix[y][x] = Math.sign(
                            (x-1/2)*(h+1/2*down)-(w+1/2*right)*(y-1/2)
                        ); //Calcula si está a un lado o a otro de la recta con el determinante //
                    }
                }
                
                for (let i = 0; i < w + 1; i++) {
                    for (let j = 0; j < h + 1; j++) {
                        const crossCheck = (latticeMatrix[j][i] * latticeMatrix[j+1][i+1] <= 0 || latticeMatrix[j+1][i] * latticeMatrix[j][i+1] <= 0)
                        if (crossCheck) {
                            // Convertir las coordenadas de latticeMatrix a coordenadas de la matriz original
                            let i1 = i * Math.sign(xf - xo);
                            let j1 = j * Math.sign(yf - yo);
                            if (this.#isWall(j1 + yo, i1 + xo, team)) {
                                bool = false;
                                break;
                            }
                        }
                    }
                }

                if (bool){
                    if (giveRay){
                        return [[xo,yo],[xf,yf],[right,down]] 
                    }
                    return true
                } 
            }
        }
        return false;
    }
    
    #inSlice(array,indexRangeEnd,arrayOfArrays,indexRangeStart = 0){
        if (typeof indexRangeStart!='number'||typeof indexRangeEnd!='number'||indexRangeStart<0
        ||indexRangeEnd<indexRangeStart||!Array.isArray(array)){
            return false;
        } 
        if (indexRangeEnd>=arrayOfArrays.length){
            indexRangeEnd = arrayOfArrays.length
        }
        const slicedArrayOfArrays = arrayOfArrays.slice(indexRangeStart,indexRangeEnd+1);
        for (let i=0; i<slicedArrayOfArrays.length; i++){
            if(slicedArrayOfArrays[i].toString() === array.toString()){
                return true;
            }
        }
        return false;
    }

    //UPDATE MATRIX

    #UpdateSplitsInflex(y,x,matrix,team,radar = true){
        let LowNeighbours=this.#lowestNeighbour(y,x,matrix,team);
        let HighNeighbours=this.#highestNeighbour(y,x,matrix,team);
        this.#forceUpdateMatrix(y,x,0,this.splitsMatrix)
        if(LowNeighbours.b.length==0){
            LowNeighbours=[LowNeighbours.a]
        } else{
            LowNeighbours=LowNeighbours.b
        }
        if(HighNeighbours.b.length==0){
            HighNeighbours=[HighNeighbours.a]
        } else{
            HighNeighbours=HighNeighbours.b
        }
        if (HighNeighbours[0][0]<=matrix[y][x]){
            this.#forceUpdateMatrix(y,x,3,this.splitsMatrix)
        } else if (HighNeighbours.length>1){
            this.#forceUpdateMatrix(y,x,1,this.splitsMatrix)
        }        
        if (LowNeighbours[0][0]<=matrix[y][x] && (LowNeighbours.length>1 || this.#findBlockInSurrounding(x,y,[matrix[y][x]],[],matrix,true,team,false,0,radar).length>0)){ //Dejamos que sobreescriba al 3, como es lógico; y al 1 porque es más importante si permite inflexión que si permite bifurcación, de ahí que inflex esté en el nombre
            this.#forceUpdateMatrix(y,x,2,this.splitsMatrix)
        }
    }

    #forceUpdateMatrix(y,x,v,matrix = this.matrix) {
        matrix[y][x] = v;
    }

    #aliveUpdateMatrix(y,x,team,Killing = false){
        this.centerAVal = this.aliveMatrix[y][x];
        if (Killing===false){
            let Updating=[[x,y]];
            for (let PIndex=0;PIndex<Updating.length;PIndex++){
                let X=Updating[PIndex][0]
                let Y=Updating[PIndex][1]
                this.centerAVal = this.aliveMatrix[Y][X];
                if (this.centerAVal==1||this.centerAVal==0) continue;
                if (this.centerAVal != 0){
                    let HasChain = this.#allMonotonusPathsTo(0,Y,X,this.aliveMatrix,team,this.aliveMatrix,true,1,0,true,true,true,true,true)
                    let LowNeighbours = this.#lowestNeighbour(Y,X,this.aliveMatrix,team)
                    if (HasChain){
                        this.newAVal = LowNeighbours.a[0]+1
                    } else{ //Para cuando hay que actualizar una cadena que decrece a la nada
                        this.newAVal = this.#highestNeighbour(Y,X,this.aliveMatrix,team).a[0]+1
                    }
                    this.#forceUpdateMatrix(Y,X,this.newAVal,this.aliveMatrix);
                    let SameAVal = this.#findBlockInSurrounding(X,Y,[this.aliveMatrix[Y][X]],[],this.aliveMatrix,true,team,false,0,true).map(point => [this.aliveMatrix[Y][X]].concat(point));
                    for (const SPoint of this.#surroundings(X,Y,team)){
                        if(Math.abs(this.aliveMatrix[SPoint[1]][SPoint[0]] - this.aliveMatrix[SPoint[1]][SPoint[0]])>1 || !HasChain){
                            Updating.push([SPoint[0],SPoint[1]]);
                            Updating.push([X,Y])
                        } 
                        this.#UpdateSplitsInflex(SPoint[1],SPoint[0],this.aliveMatrix,team);
                    }
                    this.#UpdateSplitsInflex(Y,X,this.aliveMatrix,team);
                    for (const i of this.#lowestNeighbour(Y,X,this.aliveMatrix,team).b){
                        this.#UpdateSplitsInflex(i[2],i[1],this.aliveMatrix,team);
                    }
                }
            }
        } else{
            let Survivors = [];
            for (const SPoint of this.#surroundings(x,y,team)){
                let killThisBranch=true
                let InflexionPoints = [[SPoint[0],SPoint[1]]];
                let InflexionPointsHash = new Set()
                InflexionPointsHash.add(JSON.stringify([SPoint[0],SPoint[1]]));
                let UpdateThis = []
                for (let IfxIndex=0;IfxIndex < InflexionPoints.length; IfxIndex++){
                    let Point = InflexionPoints[IfxIndex];
                    let MonotonousDescendingPaths = this.#allMonotonusPathsTo(0,Point[1],Point[0],this.aliveMatrix,team,this.aliveMatrix,true,1,0,true,true,true,true)
                    let PointsOfPathsToMoreInflexions=this.#allMonotonusPathsTo(0,Point[1],Point[0],this.aliveMatrix,team,this.splitsMatrix,false,2,0,true,true,true);
                    if (MonotonousDescendingPaths[1]){
                        Survivors.push(Point);
                        killThisBranch=false
                    } else{
                        UpdateThis = UpdateThis.concat(PointsOfPathsToMoreInflexions[0])
                    }
                    
                    //A cada camino que desciende si desciende al origen no hay que actualizarlo y si no entonces sí 
                    let PointsOfPathsToLowerTerminusEnds = MonotonousDescendingPaths[4].flat(1);
                    UpdateThis = UpdateThis.concat(PointsOfPathsToLowerTerminusEnds);
                    UpdateThis = Array.from(new Set(UpdateThis.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
                    InflexionPoints = InflexionPoints.concat(PointsOfPathsToMoreInflexions[2].filter(IfxPoint => !InflexionPointsHash.has(IfxPoint)))
                    PointsOfPathsToMoreInflexions[2].forEach(IfxPoint => {
                        if (!InflexionPointsHash.has(JSON.stringify(IfxPoint))){
                            InflexionPointsHash.add(JSON.stringify(IfxPoint));
                        }
                    });
                }
                if (killThisBranch){
                    this.#kill(UpdateThis);
                }
            }
            let LowNeighbours2 = []
            for (let SIndex=0; SIndex<Survivors.length; SIndex++){
                LowNeighbours2 = LowNeighbours2.concat(this.#lowestNeighbour(Survivors[SIndex][1],Survivors[SIndex][0],this.aliveMatrix,team).b.map(row=>row.slice(1)))
            }
            LowNeighbours2 = Array.from(new Set(LowNeighbours2.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
            for (let LNIndex=0; LNIndex<LowNeighbours2.length; LNIndex++){
                this.#aliveUpdateMatrix(LowNeighbours2[LNIndex][1],LowNeighbours2[LNIndex][0],team,false)
            }
            for (const SPoint of this.#surroundings(x,y,team)){
                this.#aliveUpdateMatrix(SPoint[1],SPoint[0],team,false)
            }
        }
        this.lastAVal = this.newAVal
    }

    #hasShortChain(Bifurcation,BCnum,y,x,matrixPath,team,matrixDestiny=matrixPath,descend=true,targetDestinyVal=1,pathIgnoreVal = 0,radar = true){ //Use this method
        let i = BCnum;
        let newAval = [matrixPath[y][x],x,y];
        //Primero el "edge case"
        if (matrixDestiny[y][x]===targetDestinyVal){
            if (Bifurcation){
                let newSameVal = this.#findBlockInSurrounding(x,y,[matrixPath[y][x]],[],matrixPath,true,team,false,pathIgnoreVal,radar).map(point => [matrixPath[y][x]].concat(point));
                if (descend){
                    newAval = this.#lowestNeighbour(y,x,matrixPath,team,pathIgnoreVal,radar);
                    newAval.b = newAval.b.concat(newSameVal);
                    newAval.b = Array.from(new Set(newAval.b.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
                    let newBifurcations = newAval.b.map(row => row.slice(1)).map(row => row.concat([x,y]));
                    this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations)
                } else{
                    newAval = this.#highestNeighbour(y,x,matrixPath,team,pathIgnoreVal,radar);
                    newAval.b = newAval.b.concat(newSameVal);
                    newAval.b = Array.from(new Set(newAval.b.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
                    let newBifurcations = newAval.b.map(row => row.slice(1)).map(row => row.concat([x,y]));
                    this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations)
                }
            }
            return [[[x,y]],true]
        }
        if (descend){
            while (this.#inSlice(newAval,i-1,this.blockChain,BCnum)==false){
                let oldAval = newAval[0] // Para debugging
                let oldX = newAval[1];
                let oldY = newAval[2];
                let origin = this.BifurcationIndices.length>0 ? this.BifurcationIndices[this.globalBifurcationIndex].slice(2) : [oldX,oldY]; //Queremos los dos últimos números que indican de dónde proviene la bifurcación, para no volver ahí
                this.blockChain[i] = newAval;
                newAval = this.#lowestNeighbour(oldY,oldX,matrixPath,team,pathIgnoreVal,radar); // es 2, 1 porque lowest devuelve x, y
                newAval.b = newAval.b.filter(Avals => !Avals.every((value, index) => {
                    return value == newAval.a[index];
                }))
                let IgnorePoints = newAval.b.filter(Avals => Avals[0]==matrixPath[oldY][oldX]).map(Aval => Aval.slice(1))
                let newSameVal = this.#findBlockInSurrounding(oldX,oldY,[matrixPath[oldY][oldX]],IgnorePoints,matrixPath,true,team,false,pathIgnoreVal,radar).map(point => [matrixPath[oldY][oldX]].concat(point));
                newAval.b = newAval.b.concat(newSameVal);
                if (i>BCnum && newAval.a.every((value, index) => value == this.blockChain[i-1][index]) && newAval.b.length>0){
                    //Los índices de bifurcación son los lugares (x,y) que no visitamos pudiendo visitarlos
                    if (Bifurcation){
                        let newBifurcations = newAval.b.concat([newAval.a]).slice(1).map(row => row.slice(1)).filter(row => !row.every((value,index) => value===origin[index])).map(row => row.concat([oldX,oldY]));
                        this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations)
                    }
                    newAval = newAval.b[0];
                } else{
                    if (Bifurcation){
                        let newBifurcations = newAval.b.map(row => row.slice(1)).filter(row => !(row.every((value,index) => value==newAval.a.slice(1)[index]) || row.every((value,index) => value==origin[index]))).map(row => row.concat([oldX,oldY]));
                        this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations)
                    }
                    newAval=newAval.a;
                }
                i ++;
                if (matrixDestiny[newAval[2]][newAval[1]] == targetDestinyVal){
                    this.blockChain[i] = newAval;
                    return [this.blockChain.slice(BCnum,i+1).map(row => row.slice(1)),true];
                }
            }
            if (Bifurcation){
                let newSameVal = this.#findBlockInSurrounding(x,y,[matrixPath[y][x]],[],matrixPath,true,team,false,pathIgnoreVal,radar).map(point => [matrixPath[y][x]].concat(point));
                let oldX = newAval[1];
                let oldY = newAval[2];
                newAval = this.#lowestNeighbour(oldY,oldX,matrixPath,team,pathIgnoreVal,radar);
                newAval.b = newAval.b.concat(newSameVal);
                newAval.b = Array.from(new Set(newAval.b.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
                let newBifurcations = newAval.b.map(row => row.slice(1)).map(row => row.concat([oldX,oldY]));
                this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations);
            }
            return [this.blockChain.slice(BCnum,i).map(row => row.slice(1)),false];
        } else{
            while (this.#inSlice(newAval,i-1,this.blockChain,BCnum)==false){
                let oldAval = newAval[0] // Para debugging
                let oldX = newAval[1];
                let oldY = newAval[2];
                let origin = this.BifurcationIndices.length>0 ? this.BifurcationIndices[this.globalBifurcationIndex].slice(2) : [oldX,oldY]; //Queremos los dos últimos números que indican de dónde proviene la bifurcación, para no volver ahí
                this.blockChain[i] = newAval;
                newAval = this.#highestNeighbour(oldY,oldX,matrixPath,team,pathIgnoreVal,radar); // es 2, 1 porque lowest devuelve x, y
                newAval.b = newAval.b.filter(Avals => !Avals.every((value, index) => {
                    return value == newAval.a[index];
                }))
                let IgnorePoints = newAval.b.filter(Avals => Avals[0]==matrixPath[oldY][oldX]).map(Aval => Aval.slice(1)).concat([this.blockChain[i].slice(1)]);
                let newSameVal = this.#findBlockInSurrounding(oldX,oldY,[matrixPath[oldY][oldX]],IgnorePoints,matrixPath,true,team,false,pathIgnoreVal,radar).map(point => [matrixPath[oldY][oldX]].concat(point));
                newAval.b = newAval.b.concat(newSameVal);
                if (i>BCnum && newAval.a.every((value, index) => value == this.blockChain[i-1][index]) && newAval.b.length>0){
                    //Los índices de bifurcación son los lugares (x,y) que no visitamos pudiendo visitarlos
                    if (Bifurcation){
                        let newBifurcations = newAval.b.concat([newAval.a]).slice(1).map(row => row.slice(1)).filter(row => !row.every((value,index) => value===origin[index])).map(row => row.concat([oldX,oldY]));
                        this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations);
                    }
                    newAval = newAval.b[0];
                } else{
                    if (Bifurcation){
                        let newBifurcations = newAval.b.map(row => row.slice(1)).filter(row => !(row.every((value,index) => value==newAval.a.slice(1)[index]) || row.every((value,index) => value==origin[index]))).map(row => row.concat([oldX,oldY]));
                        this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations);
                    }
                    newAval=newAval.a;
                }
                i ++;
                if (matrixDestiny[newAval[2]][newAval[1]] == targetDestinyVal){
                    this.blockChain[i] = newAval;
                    return [this.blockChain.slice(BCnum,i+1).map(row => row.slice(1)),true];
                }
            }
            if (Bifurcation){
                let oldX = newAval[1];
                let oldY = newAval[2];
                let newSameVal = this.#findBlockInSurrounding(x,y,[matrixPath[y][x]],[],matrixPath,true,team,false,pathIgnoreVal,radar).map(point => [matrixPath[y][x]].concat(point));
                newAval = this.#highestNeighbour(oldY,oldX,matrixPath,team,pathIgnoreVal,radar);
                newAval.b = newAval.b.concat(newSameVal);
                newAval.b = Array.from(new Set(newAval.b.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
                let newBifurcations = newAval.b.map(row => row.slice(1)).map(row => row.concat([oldX,oldY]));
                this.BifurcationIndices = this.BifurcationIndices.concat(newBifurcations);
            }
            return [this.blockChain.slice(BCnum,i).map(row => row.slice(1)),false];
        }
    }

    #allMonotonusPathsTo(BCnum,y,x,matrixPath,team,matrixDestiny=matrixPath,descend=false,targetDestinyVal=1,pathIgnoreVal = 0,radar = true,SemiBoolean=true,GiveEndPoints=false,GiveSRPaths=false,TrueBoolean=false){
        let SemiPaths=[];
        let ResiduePaths=[];
        let allMonotonusPathsTo=[];
        this.BifurcationIndices = [[x,y,x,y]]; // El punto x,y está en el índice 0 del primer camino que es el que no recorre nada y parte del punto x,y
        let Reconstructor = [];
        if (TrueBoolean){
            for (let i=0; i<this.BifurcationIndices.length; i++){
                this.globalBifurcationIndex = i;
                let lastBifurcationLength = this.BifurcationIndices.length
                let Path = this.#hasShortChain(true,BCnum,this.BifurcationIndices[i][1],this.BifurcationIndices[i][0],matrixPath,team,matrixDestiny,descend,targetDestinyVal,pathIgnoreVal,radar);
                if (Path[1]){
                    return true
                }
                this.BifurcationIndices = this.BifurcationIndices.filter(Bifurcation => Bifurcation.length!==0)
                let newLength = this.BifurcationIndices.length
                let diferenceInLength = newLength-lastBifurcationLength
                for (let j=0; j<diferenceInLength;j++){
                    this.BifurcationIndices.filter((Bifurcation,Bindex) => {
                    let alreadyChecked = Bifurcation.every((value,index) => value===this.BifurcationIndices[j+lastBifurcationLength][index])
                    if (alreadyChecked && (j+lastBifurcationLength !== Bindex)){
                        return false
                    }
                    return true;
                    })
                }
                this.BifurcationIndices = this.BifurcationIndices.filter(Bifurcation => Bifurcation!==null)
            }
            return false
        }
        for (let i=0; i<this.BifurcationIndices.length; i++){
            this.globalBifurcationIndex = i;
            let lastBifurcationLength = this.BifurcationIndices.length
            let Path = this.#hasShortChain(true,BCnum,this.BifurcationIndices[i][1],this.BifurcationIndices[i][0],matrixPath,team,matrixDestiny,descend,targetDestinyVal,pathIgnoreVal,radar);
            let newBifurcations = [];
            this.BifurcationIndices = this.BifurcationIndices.filter(Bifurcation => Bifurcation.length!==0)
            let newLength = this.BifurcationIndices.length
            let diferenceInLength = newLength-lastBifurcationLength
            for (let j=0; j<diferenceInLength;j++){
                newBifurcations.push(this.BifurcationIndices.findIndex((Bifurcation,Bindex) => {
                    let alreadyChecked = (Bifurcation==null ? false : Bifurcation.every((value,index) => value===this.BifurcationIndices[j+lastBifurcationLength][index]))
                    if (alreadyChecked && (j+lastBifurcationLength !== Bindex)){
                        this.BifurcationIndices[j+lastBifurcationLength]=null
                    }
                    return alreadyChecked;
                }))
            }
            this.BifurcationIndices = this.BifurcationIndices.filter(Bifurcation => Bifurcation!==null)
            if (Path[1]){
                SemiPaths.push(Path[0])
                Reconstructor.push([true,Path[0],i,newBifurcations]) //Array.from({length: this.BifurcationIndices.length - lastBifurcationLength}, (_, j) => j + lastBifurcationLength)]) //Es un SemiPaths, cuál es, a partir de qué bifurcación surge y qué bifurcaciones parten del mismo (dadas por sus índices en la lista de bifurcaciones)
            } else{
                ResiduePaths.push(Path[0])
                Reconstructor.push([false,Path[0],i,newBifurcations]) //Es un ResiduePaths, cuál es, a partir de qué bifurcación surge y qué bifurcaciones parten del mismo (dadas por sus índices en la lista de bifurcaciones)
            }
        }
        if (SemiBoolean){
            if (GiveEndPoints){
                if (GiveSRPaths){
                    return [(SemiPaths.flat(1)).concat(ResiduePaths.flat(1)),SemiPaths.length>0,SemiPaths.map(SPath => SPath[SPath.length-1]),SemiPaths,ResiduePaths];    
                }
                return [(SemiPaths.flat(1)).concat(ResiduePaths.flat(1)),SemiPaths.length>0,SemiPaths.map(SPath => SPath[SPath.length-1])];
            }
            if (GiveSRPaths){
                return [(SemiPaths.flat(1)).concat(ResiduePaths.flat(1)),SemiPaths.length>0,SemiPaths,ResiduePaths];
            }
            return [(SemiPaths.flat(1)).concat(ResiduePaths.flat(1)),SemiPaths.length>0];
        }
        for (let ReconstructorIndex=0;ReconstructorIndex<Reconstructor.length;ReconstructorIndex++) {
            let Transform = Reconstructor[ReconstructorIndex];
            if (Transform[0]){
                let TCindex = []
                let TransformConectors = Reconstructor.filter((TTransform,index) => {
                    if (TTransform[3].includes(Transform[2])){
                        TCindex.push(index)
                        return true
                    } else{
                        return false
                    }
                });
                if (TransformConectors.length === 0) continue;
                Reconstructor=Reconstructor.concat(TransformConectors.map((TransformConector,index) => {
                    let BifIndex = TransformConector[1].findIndex(Point => (Point[0]===this.BifurcationIndices[Transform[2]][2])&&(Point[1]===this.BifurcationIndices[Transform[2]][3])) //BifInd es x,y y Point de Path es x,y //ARREGLAR (SÓLO FALTA ESTO)
                    let newSPath = (TransformConector[1].slice(0,BifIndex+1)).concat(Transform[1]);
                    Reconstructor[TCindex[index]][3]=TransformConector[3].filter(num => num!==Transform[2]);
                    return ([true,newSPath,TransformConector[2],((Reconstructor[TCindex[index]][3].filter(value => value>Transform[2])).concat(Transform[3]))]);
                }));
            }
        }
        allMonotonusPathsTo = (Reconstructor.filter(Transform => Transform[0]&&(Transform[1][0][0]===x)&&(Transform[1][0][1]===y))).map(Transform => Transform[1]);
        if (GiveEndPoints){
            return [allMonotonusPathsTo.map(Path => Path.concat([,])),Array.from(new Set(SemiPaths.map(SPath => SPath[SPath.length-1]).map(JSON.stringify))).map(JSON.parse),Reconstructor.map(Transform => [Transform[0],Transform[1]])];
        }
        return allMonotonusPathsTo;
    }

    #highestNeighbour(y,x,matrix,team = 0,ignore = 0,radar = true, useTeams = true){ // Returns triple, first element is value second & third is coordinate of value (same for lowest)
        let highestValue = Number.NEGATIVE_INFINITY;
        let compareMVal = 0;
        let xM = x;
        let yM = y;
        let forks = [];
        let forks2 = [];
        for (const SPoint of this.#surroundings(x,y,team,ignore,useTeams,true,radar,matrix,false)){
            compareMVal = matrix[SPoint[1]][SPoint[0]]
            highestValue = Math.max(highestValue,compareMVal);
            if (highestValue === compareMVal){
                xM = SPoint[0];
                yM = SPoint[1];
                forks.push([compareMVal,SPoint[0],SPoint[1]]);
            }
        }
        for (let i=0; i<forks.length; i++){
            if (forks[i][0]==highestValue){
                forks2.push(forks[i])
            }
        }
        if (isFinite(highestValue)) {
            if (matrix[y][x] != ignore){
                return  matrix[y][x]>highestValue ? {a:[matrix[y][x],x,y], b:[]} : {a:[highestValue,xM,yM], b:forks2};
            } else {
                return  {a:[highestValue,xM,yM], b:forks2};
            }
        }
        return {a:[matrix[y][x],x,y], b:[]};
    }

    #lowestNeighbour(y,x,matrix,team = 0,ignore = 0,radar = true, useTeams = true){
        let lowestValue = Number.POSITIVE_INFINITY;
        let comparemVal = 0;
        let xm = x;
        let ym = y;
        let forks = [];
        let forks2 = [];
        for (const SPoint of this.#surroundings(x,y,team,ignore,useTeams,true,radar,matrix,false)){
            comparemVal = matrix[SPoint[1]][SPoint[0]]
            lowestValue = Math.min(lowestValue,comparemVal);
            if (lowestValue === comparemVal){
                xm = SPoint[0];
                ym = SPoint[1];
                forks.push([comparemVal,SPoint[0],SPoint[1]]);
            }
        }
        for (let i=0; i<forks.length; i++){
            if (forks[i][0]===lowestValue){
                forks2.push(forks[i])
            }
        }
        if (isFinite(lowestValue)) {
            if (matrix[y][x] != ignore){
                return  matrix[y][x]<lowestValue ? {a:[matrix[y][x],x,y], b:[]} : {a:[lowestValue,xm,ym], b:forks2};
            } else {
                return  {a:[lowestValue,xm,ym], b:forks2};
            }
            
        }
        return {a:[matrix[y][x],x,y], b:[]}
    }

    #SetCombiner(set1, set2) {
        // Crear un Set para almacenar las duplas únicas
        const uniquePairs = new Set();

        // Función para convertir un array a una cadena única
        const pairToString = pair => JSON.stringify(pair);

        // Añadir todos los elementos de set1 al Set único
        set1.forEach(pair => uniquePairs.add(pairToString(pair)));

        // Añadir todos los elementos de set2 al Set único
        set2.forEach(pair => uniquePairs.add(pairToString(pair)));

        // Convertir el Set único de nuevo a un array de arrays
        return Array.from(uniquePairs).map(pair => JSON.parse(pair));
    }

    #updateWall(x,y,jWMx = this.jointWallMax){
        const count = this.#countJoint(x,y,this.matrix,[5,7]);
        if (count.length > jWMx-1){
            for (let i = 0; i<count.length; i++){
                this.#forceUpdateMatrix(count[i][1],count[i][0],7);
            }
        }
    }
    
    #countJoint(x,y,matrix = this.matrix,targetValArray = [matrix[y][x]], jointMax = totalColumns*totalRows){
        let count = [[x,y]];
        let j=0
        while (j<count.length && j<jointMax){
            count = this.#findBlockInSurrounding(count[j][0],count[j][1],targetValArray,count,matrix)
            j++
        }
        if (j>=jointMax){
            return NaN;
        }
        return count;
    }

    #findBlockInSurrounding(x,y,targetValArray,alreadyCheckedArrayOfArrays = [],matrix = this.matrix,useTeams=false, team=this.team, Accumulate = true, ignore = 0,radar=false){
        let count = Accumulate ? alreadyCheckedArrayOfArrays : [];
        for (const SPoint of this.#surroundings(x,y,team,ignore,useTeams,true,radar,matrix,false)){
            if (targetValArray.includes(matrix[SPoint[1]][SPoint[0]])===false) continue;
            if (Accumulate){
                if (this.#inSlice([SPoint[0],SPoint[1]],count.length,count)===false) {
                    count.push([SPoint[0],SPoint[1]])
                };
            } else {
                if (this.#inSlice([SPoint[0],SPoint[1]],alreadyCheckedArrayOfArrays.length,alreadyCheckedArrayOfArrays)===false) {
                    count.push([SPoint[0],SPoint[1]])
                };
            }
        }
        return count
    }

    //MOVE

    ChangePlayerMovement = ({keyCode}) => {
        if (keyCode === 82){//r
            document.removeEventListener("keydown", this.PlayerMovement_Keys);
            document.addEventListener("mousemove", this.PlayerMovement_Mouse);
        } else if (keyCode === 84){ //t
            document.removeEventListener("mousemove", this.PlayerMovement_Mouse);
            document.addEventListener("keydown", this.PlayerMovement_Keys);
        }
    } 

    PlayerMouse = (event) => {
        if (this.playerHidden === false){
            this.render();
            var rect = this.outlineContext.canvas.getBoundingClientRect();
            var mouseX = (event.clientX - rect.left);
            var mouseY = (event.clientY - rect.top);
            if (mouseX - this.player.x > 0.9){
                if (this.#isValidMove(1, 0)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y][this.player.x + 1];
                    this.#forceUpdateMatrix(this.player.y, this.player.x + 1, 2);
                    this.player.x ++;
                    this.render();
                }
            } else if (mouseY - this.player.y > 0.9){
                if (this.#isValidMove(0, +1)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y + 1][this.player.x];
                    this.#forceUpdateMatrix(this.player.y + 1, this.player.x, 2);
                    this.player.y ++;
                    this.render();
                }
            } else if (mouseX - this.player.x < -0.9){
                if (this.#isValidMove(-1, 0)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y][this.player.x - 1];
                    this.#forceUpdateMatrix(this.player.y, this.player.x - 1, 2);
                    this.player.x --;
                    this.render();
                }
            } else if (mouseY - this.player.y < -0.9){
                if (this.#isValidMove(0, -1)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y - 1][this.player.x];
                    this.#forceUpdateMatrix(this.player.y - 1, this.player.x, 2);
                    this.player.y --;
                    this.render();
                }
            }
        }
    }
    
    PlayerMovement_Keys = ( { keyCode } ) => { 
        if (this.playerHidden === false){
            if (keyCode === 37) {
                if (this.#isValidMove(-1, 0)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y][this.player.x - 1];
                    this.#forceUpdateMatrix(this.player.y, this.player.x - 1, 2);
                    this.player.x --;
                    this.render();
                }
            }else if (keyCode === 39){
                if (this.#isValidMove(1, 0)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y][this.player.x + 1];
                    this.#forceUpdateMatrix(this.player.y, this.player.x + 1, 2);
                    this.player.x ++;
                    this.render();
                }
            }else if (keyCode === 38) {
                if (this.#isValidMove(0, -1)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y - 1][this.player.x];
                    this.#forceUpdateMatrix(this.player.y - 1, this.player.x, 2);
                    this.player.y --;
                    this.render();
                }
            }else if (keyCode === 40) {
                if (this.#isValidMove(0, +1)) {
                    this.#forceUpdateMatrix(this.player.y, this.player.x, this.pVal);
                    this.pVal = this.matrix[this.player.y + 1][this.player.x];
                    this.#forceUpdateMatrix(this.player.y + 1, this.player.x, 2);
                    this.player.y ++;
                    this.render();
                }            
            }
        }
    }

    //PLACE

    PlayerPlace_Bases = ( { keyCode } ) => {
        if (keyCode === 50 && this.bases>0){
            if (this.#isAlone(this.player.x, this.player.y)) {
                this.pVal = 3;
                this.bases --;
                this.teamMatrix[this.player.y][this.player.x] = this.team;
                this.aliveMatrix[this.player.y][this.player.x] = 1;
                this.team ++;
                if (this.bases === 0){
                    this.mode = "Deciding"
                    this.totalTeams = this.team-1;
                    this.team = 1;
                    document.removeEventListener("keydown", this.PlayerPlace_Bases);
                    document.addEventListener("keydown", this.PlayerDecide);
                    this.render();
                } else{
                    this.render();
                }
            }
        }
    }

    PlayerPlace = ({keyCode}) =>{
        const x = this.player.x;
        const y = this.player.y;
        this.#hidePlayer();
        if (this.points==this.maxPoints){
            if (keyCode === 65){
                this.mode = "Attack"
                document.removeEventListener("keydown", this.PlayerDecide);
                document.addEventListener("keydown", this.PlayerAttack);
                this.render();
            }
        }
        if (this.points>0 && (this.matrix[y][x] === 1 || this.matrix[y][x] === 4)){
            if (this.#isValidPlacement(x,y,this.team)){
                if (keyCode === 51 && this.matrix[y][x] === 1){ //Place Land
                    this.matrix[y][x] = 4;
                    this.#forceUpdateMatrix(y,x,this.team,this.teamMatrix);
                    this.#forceUpdateMatrix(y,x,Number.POSITIVE_INFINITY,this.aliveMatrix) //Because AliveUpdate uses lowest +1 to determine value
                    this.#aliveUpdateMatrix(y,x,this.team);
                    this.points --;
                } else if (this.matrix[y][x] === 4){ //Place On Land
                    if (keyCode === 52){ //Place Wall
                        const isValidW = this.#isValidWall(x,y)
                        if (isValidW[0]){
                            if (isValidW[1]==jointWallMax){
                                if (this.points > 1){
                                    this.matrix[y][x] = 7;   
                                    this.points = this.points-2;
                                    this.#updateWall(x,y);
                                }
                            } else{
                                this.matrix[y][x] = 5;   
                                this.points --;
                                this.#updateWall(x,y);
                            }
                            
                        }
                    } else if (this.points > 3 && (keyCode === 53)){ //Place Turret
                        this.matrix[y][x] = 6;
                        this.points = this.points - 4;
                    } else if (this.points > 2 && (keyCode === 54)){ //Place Radar
                        this.matrix[y][x] = 8;
                        this.points = this.points - 3;
                    }
                }
            }
        } else if (keyCode === 32){
            this.team = this.#nextTeam(this.team);
            this.points = this.maxPoints;
            this.mode = "Deciding";
            document.removeEventListener("keydown", this.PlayerPlace);
            document.addEventListener("keydown", this.PlayerDecide);
        }
        this.#showPlayer();
        this.render()
    }

    // ATTACK

    PlayerAttack = ({keyCode}) =>{
        const x = this.player.x;
        const y = this.player.y;
        this.#hidePlayer()
        if ((this.attacks > this.maxAttacks-1) || (keyCode === 32)){ //espacio
            this.team = this.#nextTeam(this.team)
            this.mode = "Deciding"
            document.removeEventListener("keydown", this.PlayerAttack);
            document.addEventListener("keydown", this.PlayerDecide);
            this.points = 5;
            this.mode = "Deciding";
            this.attacks=0;
            this.render();
        }
        let team  = this.teamMatrix[y][x]
        if ((keyCode === 75) && (team != this.team) && (this.#isWall(y,x,this.team) === false)){ //k
            if (this.#turretAvailable(x,y,this.team)){
                this.render();
                this.attacks ++;
                this.#kill([[x,y]]);
                this.#aliveUpdateMatrix(y,x,team,true);
            }
            this.render();
        }
        this.#showPlayer()
        this.render();
    }

    #kill(listOfXY){
        this.#hidePlayer()
        for (let i = 0; i < listOfXY.length; i++) {
            if (Array.isArray(listOfXY[i]) && listOfXY[i].length === 2 && listOfXY[i].every(element => typeof element === 'number')) {
                if (this.matrix[listOfXY[i][1]][listOfXY[i][0]]!=7){
                    this.#forceUpdateMatrix(listOfXY[i][1],listOfXY[i][0],1);
                }
                this.#forceUpdateMatrix(listOfXY[i][1],listOfXY[i][0],0,this.aliveMatrix);
                this.#forceUpdateMatrix(listOfXY[i][1],listOfXY[i][0],0,this.teamMatrix);
                this.#forceUpdateMatrix(listOfXY[i][1],listOfXY[i][0],0,this.splitsMatrix);
            }
        }
        this.#showPlayer()
    }

    //STORYTIME

    PlayerStory = ( { keyCode } ) => { 
        this.mode = "Decide Teams"
        if (keyCode === 49){ // Number 1
            this.bases ++;
            this.render();
        } else if (keyCode === 32){
            document.removeEventListener("keydown", this.PlayerStory);
            document.addEventListener("keydown", this.PlayerPlace_Bases);
            this.team = 1;
            this.points=5;
            this.render();
        } else if (keyCode === 50 && this.bases>2){
            this.bases --;
            this.render();
        } 
    }

    PlayerDecide = ({keyCode}) => {
        if (keyCode === 65){
            this.mode = "Attack"
            document.removeEventListener("keydown", this.PlayerDecide);
            document.addEventListener("keydown", this.PlayerAttack);
            this.render();
        } else if (keyCode === 80){
            this.mode = "Place"
            this.attacks = 0;
            document.removeEventListener("keydown", this.PlayerDecide);
            document.addEventListener("keydown", this.PlayerPlace);
            this.render();
        }
    }

    #showPlayer(){
        if (this.playerHidden){
            this.pVal = this.matrix[this.player.y][this.player.x];
            this.matrix[this.player.y][this.player.x] = 2;
            this.playerHidden = false
        }
    }

    #hidePlayer(){
        if (this.playerHidden === false){
            this.matrix[this.player.y][this.player.x] = this.pVal;
            this.playerHidden = true;
        }
    }

    #nextTeam(team){
        if (team>this.totalTeams-1){
            return 1
        }
        return team + 1
    }

    //RENDER

    #getCenter(w,h,p=0) {
        return{
            x: (window.innerWidth / 2 - w / 2 + p) + "px",
            y: (window.innerHeight / 2 - h / 2 + p) + "px"
            
        };
    }

    #getContext(w,h,color="#111",isTransparent = false) {
        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d");
        this.width = this.canvas.width = w;
        this.height = this.canvas.height = h;
        this.canvas.style.position = "absolute";
        this.canvas.style.background = color;   
        if (isTransparent) {
            this.canvas.style.backgroundColor = "transparent";
        }
        const center = this.#getCenter(w,h);
        this.canvas.style.marginLeft = center.x;
        this.canvas.style.marginTop = center.y;
        document.body.appendChild(this.canvas);

        return this.context;
    } 
    
    render(){
        const w = (this.cellSize + this.padding) * this.matrix[0].length - this.padding;
        const h = (this.cellSize + this.padding) * this.matrix.length - this.padding;

        const center = {
            x: Math.max(outlineWidth/2, (window.innerWidth / 2 - w / 2)),
            y: Math.max(outlineWidth/2, (window.innerHeight / 2 - h / 2))
        };

        this.topContext.canvas.style.marginLeft = center.x + "px";
        this.topContext.canvas.style.marginTop = center.y + "px";

        this.topContext.canvas.width = w;
        this.topContext.canvas.height = h;

        this.outlineContext.canvas.width = w;
        this.outlineContext.canvas.height = h;
        
        this.outlineContext.canvas.style.marginLeft = center.x + "px";
        this.outlineContext.canvas.style.marginTop = center.y + "px";

        for (let row=0; row < this.matrix.length; row++){
            for (let col=0; col < this.matrix[row].length; col++){
                const cellVal = this.matrix[row][col];
                const splitVal = this.splitsMatrix[row][col]
                let color = "#111";
                if (cellVal === 0){
                    color = "#4488FF";
                } else if (cellVal === 2) {
                    color = this.player.color;
                //}else if (splitVal==2){
                //    color = "#804000"
                //} else if (splitVal==3){  Esto es para ver los términos y los puntos medios
                //    color = "#FF0000"
                } else if (cellVal === 3) {
                    color = "#FFFF00";
                } else if (cellVal === 4) {
                    color = "#F337FF";
                } else if (cellVal === 5) {
                    color = "#FF3333";
                } else if (cellVal === 6) {
                    color = "#37FFF9";
                } else if (cellVal === 7) {
                    if (this.aliveMatrix[row][col]!=0){
                        color = "#46FF37";
                    } else{
                        color = "#26DF17"
                    }
                } else if (cellVal === 8) {
                    color = "#388018";
                } 
                
                this.outlineContext.fillStyle = color;
                this.outlineContext.fillRect(col * (this.cellSize + this.padding),
                row * (this.cellSize + this.padding), 
                this.cellSize, this.cellSize); //Because square
            }
        }

        this.uiContext.clearRect(0, 0, w*2, h*2)
        this.uiContext.font = "40px Courier";
        this.uiContext.fillStyle = "white";
        this.uiContext.fillText("GörShal",w/2,40);
        this.uiContext.fillText("Block below player :" + this.pVal,20,40);
        this.uiContext.fillText("Team number :" + this.team,20,80);
        if (this.bases === 0){
            this.uiContext.fillText("Points left :" + this.points,20,120);
        } else {
            this.uiContext.fillText("Number of Teams :" + this.bases,20,120);
        } 
        this.uiContext.fillText("Mode :" + this.mode,w-250,80);
        if (this.debug){
            this.uiContext.fillText(this.blockChain,20,h+200)
            this.uiContext.fillText(this.#findBlockInSurrounding(this.player.x,this.player.y,[5,7]),20,h+160)
            this.uiContext.fillText(this.lastAVal,20,h+240)
            this.uiContext.fillText("hi" + this.pVal + "," + this.aliveMatrix[this.player.y][this.player.x],50,h+240)
            this.uiContext.fillText("radars :" + this.#radarAvailable(this.player.x,this.player.y,this.team),w-250,120)
            this.uiContext.fillText("nearHigh :" + this.#highestNeighbour(this.player.y,this.player.x,this.aliveMatrix,1).b,w-750,110)
            this.uiContext.fillText("nearLow :" + this.#lowestNeighbour(this.player.y,this.player.x,this.aliveMatrix,1).b,w-750,60)
            this.uiContext.fillText("splitsMatrix :" + this.splitsMatrix[this.player.y][this.player.x],w-1750,120)
            this.uiContext.fillText("Bifurcations :" + this.BifurcationIndices,2000,h+240)
        } else{
            this.uiContext.fillText("1 - Más equipos 2 - Base o Menos equipos 3 - Suelo 4 - Muralla y Muralla doble 5 - Torreta 6 - Radar",20,h+200)
        }
        this.uiContext.canvas.style.marginLeft = (parseFloat(this.outlineContext.canvas.style.marginLeft) - outlineWidth/2) + "px";
        this.uiContext.canvas.style.marginTop = (parseFloat(this.outlineContext.canvas.style.marginTop) - outlineWidth/2) + "px";
    }
}


class GridMatrix {
    constructor(totalRows, totalColumns) {
        const gridmatrix = Array(totalRows).fill().map(() => new Array(totalColumns).fill(1));
        for (let row=0; row < totalRows; row++){
            gridmatrix[row][0] = 0;
            gridmatrix[row][totalColumns]=0;
        }
        for (let col=0; col < totalColumns; col++){
            gridmatrix[0][col] = 0;
            gridmatrix[totalRows-1][col]=0;
        }
        return gridmatrix
    }
}

const totalRows = 35;
const totalColumns = 65;
const gridMatrix = new GridMatrix(totalRows,totalColumns);
const outlineWidth = 256; 
const jointWallMax = 3;
const totalPoints = 5;
const totalAttacks = 3;
const gridSystem = new GridSystem(gridMatrix, 2, 2, outlineWidth, "blue",jointWallMax,totalPoints,totalAttacks);
gridSystem.render();
