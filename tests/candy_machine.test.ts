import { Statechart as candyMachine, Event, State } from '../src/candy_machine';

test('NO_COIN + HALF_TURN = SLOT_CLOSED', () => {
  const newState = candyMachine.transition(State.NO_COIN, { type: Event.HALF_TURN });
  expect(newState.matches(State.SLOT_CLOSED)).toBe(true);
  expect(newState.context).toMatchObject({
    currentCoinValue: 0,
    totalValue: 0,
    numSales: 0,
  });
});
