import { interval, fromEvent} from 'rxjs'
import { map, filter, takeUntil, scan, merge, mergeMap} from 'rxjs/operators'

/*
  Referencing and Citing.
  Most of the codes written below are all heavily inspired by the FRP Asteroids document.
  This is just to acknowledge the similarities of codes in accordance to the the document.
  Sources:
    https://tgdwyer.github.io/asteroids/
    https://stackblitz.com/edit/asteroids05?file=index.ts
*/

/** Taken from FRP Asteriods
 * apply f to every element of a and return the result in a flat array
 * @param a an array
 * @param f a function that produces an array
 */
 function flatMap<T,U>(
  a:ReadonlyArray<T>,
  f:(a:T)=>ReadonlyArray<U>
): ReadonlyArray<U> {
  return Array.prototype.concat(...a.map(f));
}

// Defining constants to be used throughout the game. This allows for easy changes of any values within the game if needed.
const
  Constants = {
    CanvasSize: 600,
    ShipInitialX: 300,
    ShipInitialY: 550,
    ShipRadius: 12,
    ShipBorderWrap: 60000,
    ShieldRadius: 35,
    BulletExpirationTime: 700,
    BulletRadius: 3,
    BulletFiringAdjustment: 15,
    InvaderRadius: 12,
    InvaderSpawnX: 120,
    InvaderSpawnY: 50,
    InvaderGap: 40,
    StartInvaderCount: 50,
    StartTime: 0,
    WinScore: 50
  } as const

// Generates a random number between the specified ranges of 2 numbers inclusive of the inputs.
const randomInt = (lower: number, upper: number) : number => Math.floor(Math.random() * (upper - lower + 1) + lower);

function spaceinvaders() {
    // Inside this function you will use the classes and functions
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!

  // ViewType to represent different view objects within the HTML
  type viewType = 'bullet'|'invader'|'ship'|'shield'|'boss'
  // Classes to represent actions that associate with the mechanics of the game
  class Tick { constructor(public readonly elapsed:number) {}}
  class Movement { constructor(public readonly direction:number) {}}
  class ShipShoot { constructor() {}}
  class Restart { constructor() {}}
  class GameEnd { constructor() {}}

  // Creating states to store objects to be read from. Initialized in Readonly formats to ensure deep immutability.
  // Body interface that defines the parameters of an HTML element (object) within the game.
  type Body = Readonly<{
    id:string,
    id_no?:number,
    x: number,
    y: number,
    radius: number,
    createTime: number,
    viewType: string
  }>
  /*
    This is the main State interface that would allow us to store information about the game.
    For any updates on the values within, we would always return a new State since this interface
    is set to readonly to keep it deeply immutable. Adhering to the FRP formats.
  */
  type State = Readonly<{
    time:number,
    ship:Body,
    shields: ReadonlyArray<Body>,
    shipBullets: ReadonlyArray<Body>,
    invaders: ReadonlyArray<Body>,
    boss: ReadonlyArray<Body>,
    bossBullets: ReadonlyArray<Body>,
    invaderBullets: ReadonlyArray<Body>,
    exit: ReadonlyArray<Body>,
    objCount:number,
    gameOver: boolean,
    bossStage: boolean,
    restart: boolean,
    restartTime: 0,
    restartDenied: boolean
  }>

  // CreateObject is a curried function that handles the creation of any object within the game. Returns a body type.
  const createObject = (viewType: viewType) => (id?:number) => (time:number) => (radius:number) => (x:number) => (y:number) =>
    <Body>{
      id: viewType+id,
      id_no: id,
      x: x,
      y: y,
      radius: radius,
      createTime: time,
      viewType: viewType
  },

  // Creation functions in initializing the initial elements of Invaders and Shields for the game.
  startInvaders = [...Array(Constants.StartInvaderCount)]
    .map((_,i)=>
    createObject('invader')(i)(Constants.StartTime)(Constants.InvaderRadius)
    ((Constants.InvaderSpawnX+((i%10)*Constants.InvaderGap))%Constants.CanvasSize)(Constants.InvaderSpawnY + Math.floor(((i - (i%10))/10))*Constants.InvaderGap)),
  startShields = [...Array(3)]
    .map((_,i)=>
    createObject('shield')(i)(Constants.StartTime)(Constants.ShieldRadius+(i*5))(Constants.ShipInitialX)(Constants.ShipInitialY)),

  // A state object that stores the initialState of all objects
  initialState :State = {
      time:0,
      ship: createObject('ship')(0)(Constants.StartTime)(Constants.ShipRadius)(Constants.ShipInitialX)(Constants.ShipInitialY),
      shields: startShields,
      shipBullets: [],
      invaders: startInvaders,
      boss: [],
      bossBullets: [],
      invaderBullets: [],
      exit: [],
      objCount: 0,
      gameOver: false,
      bossStage: false,
      restart: false,
      restartTime: 0,
      restartDenied: false
  },

  // Several move functions that controls the movement of the elements within the game
  moveObj = (x: number) => (y: number) => (o:Body) => <Body> {
    ...o,
    x: o.x + x,
    y: o.y + y
  },
  stopObj = (o:Body) => <Body>{
    ...o,
    x: o.x,
    y: o.y
  },
  moveObjShield = (s:State) => (o:Body) => <Body> {
    ...o,
    x: s.ship.x,
  },

  // A State instance that handles shooting mechanics for all elements within the game. Returns a new State.
  handleShooting = (s:State) => {
    const
      // invaderShoot is a function that handles the shooting instances of invaders
      invaderShoot = !s.restartDenied ? s.invaders.length > 0 ? s.time%50 == 0 ? s.invaderBullets.concat([createObject('bullet')(s.time)(s.time)(3)
        (s.invaders[randomInt(0, s.invaders.length-1)].x)(s.invaders[randomInt(0, s.invaders.length-1)].y + Constants.InvaderRadius - 5)])
        : s.invaderBullets : s.invaderBullets : s.invaderBullets

    return <State>{
      ...s,
      invaderBullets: invaderShoot
    }
  },

  // A State instance that handles the collisions within the game. Returns a new State.
  handleCollision = (s:State) => {
    const
      // Checks if a object has collided with another object.
      bodiesCollided = ([a,b]:[Body,Body]) => Math.sqrt((a.x - b.x)*(a.x - b.x) + (a.y - b.y)*(a.y - b.y)) < a.radius + b.radius,
      combiningObjects = (a: ReadonlyArray<Body>) => (c: ReadonlyArray<Body>) => flatMap(a, b => c.map<[Body, Body]>(i=>([b,i]))).filter(bodiesCollided),
      // Collision of ship with any object
      shipCollidedWithBullet = s.invaderBullets.filter(b=>bodiesCollided([s.ship,b])).length > 0,
      shipCollidedWithInvader = s.invaders.filter(i=>bodiesCollided([s.ship,i])).length > 0,
      // Collision for ship bullets and invaders
      allShipBulletsAndInvaders = combiningObjects(s.shipBullets)(s.invaders),
      collidedShipBullets = allShipBulletsAndInvaders.map(([bullet,_])=>bullet),
      collidedShipInvaders = allShipBulletsAndInvaders.map(([_,invader])=>invader),
      // Collision for invader bullets and shields
      allBulletsAndShields = combiningObjects(s.invaderBullets)(s.shields),
      collidedInvaderBullets = allBulletsAndShields.map(([bullet,_])=>bullet),
      collidedShields = allBulletsAndShields.map(([_,shield])=>shield),
      // To check for end game options
      noMoreInvaders =  s.invaders.length == 0,

      // Predefined functions to help filter and exclude elements that have collided. Taken from FRP Asteroids.
      not = <T>(f:(x:T)=>boolean)=>(x:T)=>!f(x),
      elem = <T>(eq: (_:T)=>(_:T)=>boolean)=>(a:ReadonlyArray<T>)=>(e:T)=> a.findIndex(eq(e)) >= 0,
      except = <T>(eq: (_:T)=>(_:T)=>boolean)=>(a:ReadonlyArray<T>)=>(b:ReadonlyArray<T>)=> a.filter(not(elem(eq)(b))),
      cut = except((a:Body)=>(b:Body)=>a.id === b.id);

    return handleShooting({
      ...s,
      shipBullets: cut(s.shipBullets)(collidedShipBullets),
      invaderBullets: cut(s.invaderBullets)(collidedInvaderBullets),
      invaders: cut(s.invaders)(collidedShipInvaders),
      shields: cut(s.shields)(collidedShields),
      exit: s.exit.concat(collidedShipBullets, collidedShipInvaders, collidedShields, collidedInvaderBullets),
      objCount: s.objCount,
      restartDenied: shipCollidedWithBullet || shipCollidedWithInvader || noMoreInvaders
    })
  },

  // A tick function to operate on elements within the game based on time. Returns a new State.
  tick = (s:State,elapsed:number) => {
    // Filtering the bullet elements to ensure they are removed from the SVG after a certain period.
    const not = <T>(f:(x:T)=>boolean)=>(x:T)=>!f(x),
      expired = (b:Body)=>(elapsed - b.createTime) > Constants.BulletExpirationTime,
      expiredBullets:Body[] = s.shipBullets.filter(expired);
    expiredBullets.concat(s.invaderBullets.filter(expired));

    // Checking to see if the game is in a pause state, if so, the bullets are left untouched.
    const pauseOrNot = (a: ReadonlyArray<Body>): ReadonlyArray<Body> => (s.restartDenied) ? a : a.filter(not(expired))
    // Checking to see if the game is in a pause state, if so, the element movements are left untouched.
    const moveOrStop = (x:number) => (y:number) => (o:Body) => (s.restartDenied) ? stopObj(o) : moveObj(x)(y)(o)
    // Checking to see if the game is in a pause state, if so, stop the clock.
    const tickOrStop = (e: number) => (s.restartDenied) ? 0 : e

    // A pure function that returns the neccessary movement controls for all of the invaders.
    const movementInv = (elapsed: number) => (speed: number) => (i: Body) =>
      elapsed<=180 ? moveOrStop(speed)(0)(i) : elapsed>180&&elapsed<=190 ? moveOrStop(0)(speed)(i) :
      elapsed>190&&elapsed<=550 ? moveOrStop(-speed)(0)(i) : elapsed>550&&elapsed<=560? moveOrStop(0)(speed)(i) :
      elapsed>560&&elapsed<=740 ? moveOrStop(speed)(0)(i) : movementInv(elapsed - 740)(speed)(i)

    return handleCollision({...s,
      shipBullets:pauseOrNot(s.shipBullets).map(o=> moveOrStop(0)(-1)(o)),
      invaderBullets: pauseOrNot(s.invaderBullets).map(o=> moveOrStop(0)(1)(o)),
      invaders: s.invaders.map(o=> movementInv(elapsed-s.restartTime)(0.5)(o)),
      boss: s.boss.map(o=> movementInv(elapsed-s.restartTime)(1.5)(o)),
      shields: s.shields.map(moveObjShield(s)),
      exit:expiredBullets,
      time:tickOrStop(elapsed),
      restart: false,
      restartDenied: s.restartDenied
    })
  },

  // the SVG canvas representing the map
  svg = document.getElementById("canvas")!,

  // Encapsulating data to perform transformation of states based on inputs. Inspired from FRP Asteroids.
  reduceState = (s:State, e:Movement|ShipShoot|GameEnd|Restart|Tick) =>
    e instanceof ShipShoot ? {...s,
        shipBullets: s.shipBullets.concat([createObject('bullet')(s.objCount)(s.time)(3)(s.ship.x)(s.ship.y - Constants.BulletFiringAdjustment - 5)]),
        objCount: s.objCount + 1
      } :
    e instanceof Movement ? {...s,
        ship: {...s.ship, x: (Constants.ShipBorderWrap + s.ship.x + e.direction)%Constants.CanvasSize},
      } :
    e instanceof GameEnd ? {...s,
        gameOver: true,
      } :
    e instanceof Restart ? {
      time: 0,
      ship: createObject('ship')(0)(Constants.StartTime)(Constants.ShipRadius)(Constants.ShipInitialX)(Constants.ShipInitialY),
      shields: startShields,
      shipBullets: [],
      invaders: startInvaders,
      boss: [],
      bossBullets: [],
      invaderBullets: [],
      exit: s.exit.concat(s.invaderBullets,s.shipBullets,s.boss),
      objCount: 0,
      gameOver: false,
      bossStage: false,
      restart: true,
      restartTime: s.time,
      restartDenied: false,
  } :
    tick(s,e.elapsed);

  // Updating the all view objects to be reflected in the SVG and HTML. Inspired from FRP Asteroids.
  function updateView(state: State): void {
    if(!state.restartDenied){
      const ship = document.getElementById('ship')!;
      ship.setAttribute('transform', `translate(${state.ship.x},${state.ship.y})`);
    }
    const updateBodyView = (b:Body) => {
      const createBodyView = ()=>{
        const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
        v.setAttribute("id",b.id);
        v.setAttribute('rx',String(b.radius));
        v.setAttribute('ry',String(b.radius));
        v.classList.add(b.viewType)
        svg.appendChild(v)
        return v;
      }
      const v = document.getElementById(b.id) || createBodyView();
      v.setAttribute("cx",String(b.x))
      v.setAttribute("cy",String(b.y))
    };
    // If a game ending sequence occurs
    if(state.restartDenied){
      const v = document.createElementNS(svg.namespaceURI, 'text')!;
      const n = document.createElementNS(svg.namespaceURI, 'text')!;
      const h = document.createElementNS(svg.namespaceURI, 'text')!;
      // Displays Game Over
      v.setAttribute('id', 'restart');
      v.setAttribute('x', String(Constants.CanvasSize/6));
      v.setAttribute('y', String(Constants.CanvasSize/2));
      v.setAttribute('class', 'gameover');
      v.textContent = 'Game Over';
      // Displays Restart K
      n.setAttribute('id', 'restart1');
      n.setAttribute('x', String(Constants.CanvasSize/4));
      n.setAttribute('y', '350');
      n.setAttribute('class', 'restart');
      n.textContent = 'Press R to Restart';
      // Displays kill game
      h.setAttribute('id', 'restart2');
      h.setAttribute('x', String(Constants.CanvasSize/4));
      h.setAttribute('y', String(Constants.CanvasSize/1.5));
      h.setAttribute('class', 'restart');
      h.textContent = 'Press N to kill Game';
      svg.appendChild(v)
      svg.appendChild(n)
      svg.appendChild(h)
      }
    // If the players chooses to restart
    if(!state.restartDenied){
      const r = document.getElementById('restart')!
      const y = document.getElementById('restart1')!
      const z = document.getElementById('restart2')!
      if (r) svg.removeChild(r)
      if (y) svg.removeChild(y)
      if (z) svg.removeChild(z)
    }
    // Updating all the elements within the SVG to reflect there positions
    state.shipBullets.forEach(updateBodyView);
    state.invaderBullets.forEach(updateBodyView);
    state.invaders.forEach(updateBodyView);
    state.shields.forEach(updateBodyView);
    state.exit.forEach(o=>{
      const v = document.getElementById(o.id);
      if(v) svg.removeChild(v)
    })
    // Displays the score within the HTML
    const score = document.getElementById('score')!;
    const currentScore = Constants.StartInvaderCount - state.invaders.length
    score.textContent = String(currentScore)
    // If the user selects to 'kill' the game, it unsubscribes from the stream.
    if(state.gameOver){
      subscription.unsubscribe();
      }
  }

  // All control observables for certain physics of the game.
  // An observable function to map controls for the mechanics of interaction within the game. Inspired from FRP Asteroids.
  type Event = 'keydown' | 'keyup'
  type Key = 'ArrowLeft' | 'ArrowRight' | 'Space' | 'ArrowLeft' | 'KeyR' | 'KeyN'
  const
    movementControls$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
      filter(({key})=> key ==='ArrowLeft' || key ==='ArrowRight'),
      filter(({repeat})=>!repeat),
      mergeMap(d=>interval(10).pipe(
          takeUntil(fromEvent<KeyboardEvent>(document, 'keyup').pipe(
            filter(({key}) => key === d.key)
            )),
            map(_=> d))
          ),
          map(d => d.key==='ArrowLeft' ? new Movement(-1): d.key==='ArrowRight' ? new Movement(1): null)),

    // A curried function that maps the key pressed and returns the action associated.
    observableKey = <T>(event:Event) => (k:Key) => (result:()=>T) =>
      fromEvent<KeyboardEvent>(document, event)
      .pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        map(result)
      ),

    // Actions associated to the active key. All are in Observables formats for us to perform observables operations if needed.
    shoot$ = observableKey('keydown')('Space')(()=> new ShipShoot),
    restart$ = observableKey('keydown')('KeyR')(()=> new Restart),
    endGame$ = observableKey('keydown')('KeyN')(()=> new GameEnd),

    // The main subscription to animate the game.
    subscription = interval(10).pipe(
        map(elapsed=> new Tick(elapsed)),
        merge(movementControls$, shoot$, restart$, endGame$),
        scan(reduceState, initialState)).subscribe(updateView);
}

  // the following simply runs your asteriods function on window load. Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      spaceinvaders();
    }
