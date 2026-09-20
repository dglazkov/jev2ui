import { test } from "node:test";
import assert from "node:assert/strict";
import { orderedNavigation } from "./navigation.js";

const home = { destination: "first", label: "Find a Walker", icon: "home" };
const explore = { destination: "w_collection", label: "Explore", icon: "explore" };
const preferences = { destination: "w_preferences", label: "Preferences", icon: "settings" };

test("Home stays first and other destinations keep their order across screens", () => {
  const fromHome = orderedNavigation([home, preferences, explore]);
  const fromExplore = orderedNavigation([explore, preferences, home]);
  assert.deepEqual(fromHome.map(({ item }) => item), [home, explore, preferences]);
  assert.deepEqual(fromExplore.map(({ item }) => item), [home, explore, preferences]);
  assert.equal(fromExplore.find(({ index }) => index === 0)!.item, explore, "active state follows the original destination");
});

test("renaming a screen does not reshuffle its destination", () => {
  const items = [preferences, home, { ...explore, label: "Zoology" }];
  assert.deepEqual(orderedNavigation(items).map(({ item }) => item.destination), ["first", "w_collection", "w_preferences"]);
  assert.equal(items[0], preferences, "saved input stays untouched");
});

test("older navigation without destination IDs still puts Home first", () => {
  assert.deepEqual(orderedNavigation([{ label: "Settings" }, { label: "Home" }, { label: "Explore" }]).map(({ item }) => item.label), ["Home", "Explore", "Settings"]);
});
