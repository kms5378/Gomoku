// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GomokuStore } from "./gomoku-store.mjs";

function makeStore() {
  return new GomokuStore(":memory:");
}

function makePlayingRoom(store) {
  const created = store.createRoom({ nickname: "Black" });
  const black = created.account;
  const code = created.state.room.code;
  const white = store.joinRoom({ code, nickname: "White" }).account;

  store.chooseSide({ accountId: black.id, code, side: "black" });
  const state = store.chooseSide({ accountId: white.id, code, side: "white" });

  return { black, code, state, white };
}

describe("GomokuStore", () => {
  it("creates an empty waiting room and starts after both players choose sides", () => {
    const store = makeStore();
    const created = store.createRoom({ nickname: "Alice" });
    const bob = store.joinRoom({ code: created.state.room.code, nickname: "Bob" }).account;

    expect(created.state.room.status).toBe("waiting");
    expect(created.state.room.black_player).toBeNull();
    expect(created.state.room.white_player).toBeNull();

    const afterBlack = store.chooseSide({ accountId: created.account.id, code: created.state.room.code, side: "black" });
    expect(afterBlack.room.status).toBe("waiting");
    expect(afterBlack.room.black_player).toBe(created.account.id);

    const afterWhite = store.chooseSide({ accountId: bob.id, code: created.state.room.code, side: "white" });
    expect(afterWhite.room.status).toBe("playing");
    expect(afterWhite.room.white_player).toBe(bob.id);
    expect(afterWhite.room.current_turn).toBe("black");
  });

  it("rejects a third player before side selection completes", () => {
    const store = makeStore();
    const created = store.createRoom({ nickname: "Alice" });
    store.joinRoom({ code: created.state.room.code, nickname: "Bob" });

    expect(() => store.joinRoom({ code: created.state.room.code, nickname: "Carol" })).toThrow("Room is full.");
  });

  it("submits moves, advances turns, and rejects duplicate cells", () => {
    const store = makeStore();
    const { black, code, white } = makePlayingRoom(store);

    const first = store.submitMove({ accountId: black.id, code, row: 7, col: 7 });
    expect(first.moves).toHaveLength(1);
    expect(first.room.current_turn).toBe("white");

    expect(() => store.submitMove({ accountId: black.id, code, row: 7, col: 8 })).toThrow("It is not your turn.");
    expect(() => store.submitMove({ accountId: white.id, code, row: 7, col: 7 })).toThrow("Cell is already occupied.");
  });

  it("finishes a five-in-a-row game and updates rating records", () => {
    const store = makeStore();
    const { black, code, white } = makePlayingRoom(store);

    store.submitMove({ accountId: black.id, code, row: 7, col: 7 });
    store.submitMove({ accountId: white.id, code, row: 8, col: 7 });
    store.submitMove({ accountId: black.id, code, row: 7, col: 8 });
    store.submitMove({ accountId: white.id, code, row: 8, col: 8 });
    store.submitMove({ accountId: black.id, code, row: 7, col: 9 });
    store.submitMove({ accountId: white.id, code, row: 8, col: 9 });
    store.submitMove({ accountId: black.id, code, row: 7, col: 10 });
    store.submitMove({ accountId: white.id, code, row: 8, col: 10 });
    const finished = store.submitMove({ accountId: black.id, code, row: 7, col: 11 });

    expect(finished.room.status).toBe("finished");
    expect(finished.room.winner).toBe("black");
    expect(store.getAccount(black.id).rating).toBe(3);
    expect(store.getAccount(black.id).wins).toBe(1);
    expect(store.getAccount(white.id).losses).toBe(1);
  });

  it("handles forfeit wins and same-room restarts with color swap", () => {
    const store = makeStore();
    const { black, code, white } = makePlayingRoom(store);

    const [forfeitState] = store.forfeitDisconnected(white.id);
    expect(forfeitState.room.status).toBe("finished");
    expect(forfeitState.room.winner).toBe("black");

    store.requestRestart({ accountId: black.id, code });
    const restarted = store.requestRestart({ accountId: white.id, code });
    expect(restarted.room.status).toBe("playing");
    expect(restarted.room.black_player).toBe(white.id);
    expect(restarted.room.white_player).toBe(black.id);
    expect(restarted.room.game_index).toBe(1);
  });
});
