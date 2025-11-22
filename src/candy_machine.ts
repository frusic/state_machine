import {
  ActionFunction,
  AnyAssignAction,
  MachineSchema,
  StateValue,
  StatesConfig,
  assign,
  createMachine,
  interpret,
} from 'xstate';
import promptSync from 'prompt-sync';
const prompt = promptSync();

// What states the machine can be in
export enum State {
  NO_COIN = 'NO_COIN',
  INVALID_COIN = 'INVALID_COIN',
  VALID_COIN = 'VALID_COIN',
  SLOT_CLOSED = 'SLOT_CLOSED',
  SHUTDOWN = 'SHUTDOWN',
}

// What types of event can be sent to the machine
export enum Event {
  HALF_TURN = 'HALF_TURN',
  ADD_COIN = 'ADD_COIN',
  REMOVE_COIN = 'REMOVE_COIN',
  SHUTDOWN = 'SHUTDOWN',
  TAMPER = 'TAMPER',
}

// What can be sent to the machine to cause transitions
type Events = { type: Exclude<Event, Event.ADD_COIN> } | { type: Event.ADD_COIN; value: number };

// What can be performed by the machine depending on state + transition
enum Action {
  DISPENSE_CANDY = 'DISPENSE_CANDY',
  RECORD_COIN = 'RECORD_COIN',
  CLEAR_COIN = 'CLEAR_COIN',
  RECORD_SALE = 'RECORD_SALE',
  LOG_SALES = 'LOG_SALES',
  SHUT_DOWN = 'SHUT_DOWN',
  INVALID_ACTION = 'INVALID_ACTION', // Throw exception
}

// Variety of candy colours
enum CandyColour {
  RED = 'red',
  GREEN = 'green',
  BLUE = 'blue',
}

// Variety of candy quality
enum CandyQuality {
  GREAT = 'tasty',
  REGULAR = 'basic',
  DISGUSTING = 'disgusting',
}

// Data stored by the machine regardless of current state
type Context = {
  currentCoinValue: number;
  totalValue: number;
  numSales: number;
  lastDispensedAt: Date;
};

// Schema allows typechecking, does not provide values in itself
const Schema: MachineSchema<Context, Events> = {
  context: {} as Context,
  events: {} as Events,
};

// Guard helper functions
const ValidCoins: ReadonlyArray<number> = [50, 100, 200];
const checkHasCoin = (currentCoinValue: number) => currentCoinValue !== 0;
const checkIsValidCoin = (currentCoinValue: number) => ValidCoins.includes(currentCoinValue);

// Conditionals that prevent/allow a transition
const Guards: Partial<Record<State, (context: Context, event: Events) => boolean>> = {
  [State.VALID_COIN]: (context) =>
    checkHasCoin(context.currentCoinValue) && checkIsValidCoin(context.currentCoinValue),
  [State.INVALID_COIN]: (context) =>
    checkHasCoin(context.currentCoinValue) && !checkIsValidCoin(context.currentCoinValue),
};

// Definition of states + transitions that can occur
const States: StatesConfig<Context, typeof Schema, Events> = {
  // Coin slot is open
  [State.NO_COIN]: {
    // When entering this state and after every event received while in this state,
    // check if machine should transition to a new state
    always: [
      {
        target: State.VALID_COIN,
        cond: Guards[State.VALID_COIN],
      },
      {
        target: State.INVALID_COIN,
        cond: Guards[State.INVALID_COIN],
      },
    ],
    on: {
      [Event.HALF_TURN]: State.SLOT_CLOSED,
      [Event.ADD_COIN]: { actions: Action.RECORD_COIN },
      [Event.SHUTDOWN]: State.SHUTDOWN,
      [Event.TAMPER]: { actions: Action.INVALID_ACTION },
    },
  },
  // Invalid coin is in coin slot
  [State.INVALID_COIN]: {
    on: {
      [Event.REMOVE_COIN]: {
        target: State.NO_COIN,
        actions: Action.CLEAR_COIN,
      },
      [Event.TAMPER]: { actions: Action.INVALID_ACTION },
    },
  },
  // Valid coin is in coin slot
  [State.VALID_COIN]: {
    on: {
      [Event.HALF_TURN]: {
        target: State.SLOT_CLOSED,
        actions: [Action.RECORD_SALE, Action.DISPENSE_CANDY, Action.CLEAR_COIN],
      },
      [Event.REMOVE_COIN]: {
        target: State.NO_COIN,
        actions: Action.CLEAR_COIN,
      },
      [Event.TAMPER]: { actions: Action.INVALID_ACTION },
    },
  },
  // Coin slot is closed, if had valid coin, candy is dispensed
  [State.SLOT_CLOSED]: {
    on: {
      [Event.HALF_TURN]: State.NO_COIN,
      [Event.TAMPER]: { actions: Action.INVALID_ACTION },
    },
  },
  // Candy machine has been turned off
  [State.SHUTDOWN]: {
    type: 'final',
    entry: [Action.LOG_SALES, Action.SHUT_DOWN],
    on: {
      '*': { actions: Action.INVALID_ACTION },
    },
  },
};

const Actions: Record<Action, ActionFunction<Context, Events> | AnyAssignAction<Context, Events>> =
  {
    // Store the added coin value to context
    [Action.RECORD_COIN]: assign({
      currentCoinValue: (_, event) => {
        switch (event.type) {
          case Event.ADD_COIN:
            return event.value;
          default:
            throw new String(event.type);
        }
      },
    }),
    // Clear coin value from context
    [Action.CLEAR_COIN]: assign({
      currentCoinValue: () => 0,
    }),
    // Add current coin value to sales record
    [Action.RECORD_SALE]: assign({
      totalValue: (context) => context.totalValue + context.currentCoinValue,
      numSales: (context) => context.numSales + 1,
    }),
    // Print out a record of the day's sales
    [Action.LOG_SALES]: (context) =>
      console.log(
        `--- Day's sales: $${(context.totalValue / 100).toFixed(2)} earned from ${
          context.numSales
        } sales. Last sale dated ${context.lastDispensedAt} ---`
      ),
    // Dispense a random piece of candy
    [Action.DISPENSE_CANDY]: () => {
      const randColourNum = Math.random() * 3;
      const randQualityNum = Math.random() * 3;
      const candyColour =
        randColourNum < 1
          ? CandyColour.RED
          : randColourNum < 2
          ? CandyColour.GREEN
          : CandyColour.BLUE;
      const candyQuality =
        randQualityNum < 1
          ? CandyQuality.DISGUSTING
          : randColourNum < 2
          ? CandyQuality.GREAT
          : CandyQuality.REGULAR;
      console.log(`--- A ${candyQuality} ${candyColour} candy has been dispensed, enjoy! ---`);
    },
    // Shut down the candy machine
    [Action.SHUT_DOWN]: () => console.log('--- Candy machine is shutting down for the day ---'),
    // An invalid action has been attempted
    [Action.INVALID_ACTION]: (_, event) => {
      throw new String(event.type);
    },
  };

// Export the candy machine state chart for testing
export const Statechart = createMachine(
  {
    predictableActionArguments: true,
    initial: State.NO_COIN,
    states: States,
    schema: Schema,
    context: {
      currentCoinValue: 0,
      totalValue: 0,
      numSales: 0,
      lastDispensedAt: new Date(),
    },
    entry: [() => console.log('--- Candy machine is open for business ---')],
  },
  {
    actions: Actions,
    guards: Guards,
  }
);

// Mapping of CLI inputs to user actions
const INPUT_MAPPING = {
  a: Event.ADD_COIN,
  b: Event.HALF_TURN,
  c: Event.REMOVE_COIN,
  d: Event.SHUTDOWN,
  e: Event.TAMPER,
} as const;

export function runCandyMachine() {
  let currState: StateValue | undefined;
  try {
    const candyMachine = interpret(Statechart).onTransition((state) => {
      currState = state.value;
      console.log('Current state:', state.value);
    });
    candyMachine.start();
    while (currState !== State.SHUTDOWN) {
      console.log('What action would you like to perform?');
      console.log('  a) Insert a coin');
      console.log('  b) Rotate the knob by half a turn');
      console.log('  c) Remove a coin');
      console.log('  d) Turn off the candy machine');
      console.log('  e) Tamper with the candy machine to try and get free candy');
      const eventInput = prompt('> ');
      console.log();
      if (!eventInput || !(eventInput in INPUT_MAPPING)) {
        // Skip invalid inputs
        continue;
      }
      // Input is valid and one of the keys of INPUT_MAPPING
      const validInput = eventInput as keyof typeof INPUT_MAPPING;
      const event = INPUT_MAPPING[validInput];
      if (event === Event.ADD_COIN) {
        // Special case, need to know what value of coin was inserted
        console.log('What dollar value coin would you like to insert?');
        const valueInput = prompt('> $');
        console.log();
        // Send the event to the candy machine
        candyMachine.send({
          type: Event.ADD_COIN,
          value: Number(valueInput) * 100,
        });
      } else {
        // Send the event to the candy machine
        candyMachine.send({ type: event });
      }
    }
    candyMachine.stop();
  } catch (e) {
    console.log(`Uh oh, someone broke the candy machine: ${currState} + ${e}`);
  }
}
