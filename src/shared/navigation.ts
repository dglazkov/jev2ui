interface NavigationItem { destination?: string; label?: string; icon?: string }

/** Preserve original indices for active state and clicks, even in already-saved mocks.
 * Identity gives destinations a stable order when their displayed titles change. */
export function orderedNavigation<T extends NavigationItem>(items: readonly T[]) {
  const home = (item: T) => item.icon === "home" || item.destination === "home" || item.label?.trim().toLowerCase() === "home";
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    Number(home(b.item)) - Number(home(a.item)) ||
    (a.item.destination ?? a.item.label ?? "").localeCompare(b.item.destination ?? b.item.label ?? "", "en"),
  );
}
