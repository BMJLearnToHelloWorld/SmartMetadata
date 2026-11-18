// navigationUtils.ts — navigation tree building, hiding and serialization.
//
// Ports of utils/CustomizaNavigation/CustomizeNavigation.ts
// (getTreeDataForNavigationItems, getHiddenKeysFromNavigationItems) and
// utils/SettingsNavigationPageUtils.tsx (getNavigationItems,
// moveNavigationItem) at pin a3012259ca.
//
// Differences from official, by necessity (see notes):
// - The base sidebar list is a parameter. Official reads
//   leftSidebarClassBase.getSidebarItems() (SIDEBAR_LIST); the product
//   shell renders layouts/nav.ts NAV_ENTRIES, so the editor builds its
//   base tree from the same entries (via the component, with resolved
//   titles) — otherwise saved ids would never match the shell the
//   consumer flow renders. Footer entries (settings/logout) are not
//   part of the editable tree, matching the official sidebar/footer
//   split. The consumer flow must use the identical base.
// - No plugin parameters: the product has no AppPlugin sidebar system,
//   so getSidebarItemsWithPlugins / mergePluginSidebarItems are not
//   ported. If plugins arrive, they must be ported together with the
//   consumer-side filterHiddenNavigationItems (not this file's scope).
// - Titles are label KEYS, translated at render (`t(node.title)` in
//   official SettingsNavigationPage's Tree.Item); saved
//   NavigationItem.title values are keys, round-tripped verbatim.
//   The component builds base items from layouts/nav.ts titleKeys.

export interface NavigationItem {
  id: string;
  title: string;
  isHidden?: boolean;
  children?: NavigationItem[];
  [key: string]: unknown;
}

export interface SidebarBaseItem {
  key: string;
  title: string;
  children?: SidebarBaseItem[];
}

export interface NavigationTreeNode {
  title: string;
  key: string;
  children?: NavigationTreeNode[];
  isHidden?: boolean;
}

function createSidebarMap(items: SidebarBaseItem[]): Map<string, SidebarBaseItem> {
  const map = new Map<string, SidebarBaseItem>();
  const addToMap = (item: SidebarBaseItem): void => {
    map.set(item.key, item);
    item.children?.forEach(addToMap);
  };
  items.forEach(addToMap);
  return map;
}

function convertSidebarChildToTreeNode(child: SidebarBaseItem): NavigationTreeNode {
  return { title: child.title, key: child.key };
}

function collectNewDefaultChildNodes(
  defaultChildren: SidebarBaseItem[],
  savedKeys: Set<string>,
): NavigationTreeNode[] {
  return defaultChildren
    .filter((child) => !savedKeys.has(child.key))
    .map(convertSidebarChildToTreeNode);
}

function convertSidebarItemToTreeNode(item: SidebarBaseItem): NavigationTreeNode {
  return {
    title: item.title,
    key: item.key,
    children: item.children?.map(convertSidebarChildToTreeNode),
  };
}

function collectNavigationKeys(navigationItems: NavigationItem[]): Set<string> {
  const keys = new Set<string>();
  navigationItems.forEach((item) => {
    keys.add(item.id);
    item.children?.forEach((child) => keys.add(child.id));
  });
  return keys;
}

function convertNavigationChildToTreeNode(
  navChild: NavigationItem,
  sidebarMap: Map<string, SidebarBaseItem>,
): NavigationTreeNode | null {
  const sidebarChild = sidebarMap.get(navChild.id);
  return sidebarChild ? { title: navChild.title, key: navChild.id } : null;
}

function buildChildrenForSavedItem(
  navItem: NavigationItem,
  sidebarItem: SidebarBaseItem | undefined,
  sidebarMap: Map<string, SidebarBaseItem>,
  savedKeys: Set<string>,
): NavigationTreeNode[] | undefined {
  const defaultChildren = sidebarItem?.children ?? [];
  const navChildren = navItem.children ?? [];

  if (navChildren.length === 0 && defaultChildren.length === 0) {
    return undefined;
  }

  const savedChildNodes = navChildren
    .map((child) => convertNavigationChildToTreeNode(child, sidebarMap))
    .filter((node): node is NavigationTreeNode => node !== null);
  const newDefaultChildNodes = collectNewDefaultChildNodes(defaultChildren, savedKeys);

  return [...savedChildNodes, ...newDefaultChildNodes];
}

function buildTreeNodeFromSavedItem(
  navItem: NavigationItem,
  sidebarMap: Map<string, SidebarBaseItem>,
  savedKeys: Set<string>,
): NavigationTreeNode {
  const sidebarItem = sidebarMap.get(navItem.id);
  return {
    title: navItem.title,
    key: navItem.id,
    children: buildChildrenForSavedItem(navItem, sidebarItem, sidebarMap, savedKeys),
  };
}

function convertNewDefaultItemToTreeNode(
  sidebarItem: SidebarBaseItem,
  savedKeys: Set<string>,
): NavigationTreeNode {
  return {
    title: sidebarItem.title,
    key: sidebarItem.key,
    children: sidebarItem.children
      ? collectNewDefaultChildNodes(sidebarItem.children, savedKeys)
      : undefined,
    isHidden: true,
  };
}

/**
 * Edit-state tree for a saved navigation value. `null`/empty input
 * yields the full default sidebar tree — never an empty tree.
 */
export function getTreeDataForNavigationItems(
  navigationItems: NavigationItem[] | null | undefined,
  baseItems: SidebarBaseItem[],
): NavigationTreeNode[] {
  if (navigationItems === null || navigationItems === undefined || navigationItems.length === 0) {
    return baseItems.map(convertSidebarItemToTreeNode);
  }

  const sidebarMap = createSidebarMap(baseItems);
  const savedKeys = collectNavigationKeys(navigationItems);

  const savedNodes = navigationItems
    .filter((navItem) => sidebarMap.has(navItem.id))
    .map((navItem) => buildTreeNodeFromSavedItem(navItem, sidebarMap, savedKeys));

  const newDefaultNodes = baseItems
    .filter((sidebarItem) => !savedKeys.has(sidebarItem.key))
    .map((sidebarItem) => convertNewDefaultItemToTreeNode(sidebarItem, savedKeys));

  return [...savedNodes, ...newDefaultNodes];
}

function collectSidebarKeys(sidebarItem: SidebarBaseItem): string[] {
  const keys = [sidebarItem.key];
  sidebarItem.children?.forEach((child) => keys.push(child.key));
  return keys;
}

function createNavigationMap(
  navigationItems: NavigationItem[],
): Map<string, NavigationItem> {
  const map = new Map<string, NavigationItem>();
  navigationItems.forEach((item) => {
    map.set(item.id, item);
    item.children?.forEach((child) => map.set(child.id, child));
  });
  return map;
}

/**
 * Keys hidden in the edit state: sidebar keys absent from the saved
 * navigation, or saved with isHidden. `null`/empty input yields [].
 */
export function getHiddenKeysFromNavigationItems(
  navigationItems: NavigationItem[] | null | undefined,
  baseItems: SidebarBaseItem[],
): string[] {
  if (!navigationItems || navigationItems.length === 0) {
    return [];
  }

  const navigationMap = createNavigationMap(navigationItems);
  return baseItems
    .flatMap(collectSidebarKeys)
    .filter((key) => {
      const navItem = navigationMap.get(key);
      return !navItem || Boolean(navItem.isHidden);
    });
}

/**
 * Serialize the edit tree back to NavigationItem[]. Verbatim official
 * shape: {id, title, isHidden, children} — always with a children
 * array, and no pageId despite the schema requiring it.
 */
export function getNavigationItems(
  treeData: NavigationTreeNode[],
  hiddenKeys: string[],
): NavigationItem[] {
  return treeData.map((item) => ({
    id: item.key,
    title: item.title,
    isHidden: hiddenKeys.includes(item.key),
    children: getNavigationItems(item.children ?? [], hiddenKeys),
  }));
}

function cloneNavigationTree(nodes: NavigationTreeNode[]): NavigationTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNavigationTree(node.children) : undefined,
  }));
}

export type NavigationDropPosition = 'before' | 'after' | 'on';

/**
 * Move a tree node. Dropping a parent into its own subtree is rejected
 * (returns the input tree unchanged); dropping on a root target with no
 * target key appends to the root.
 */
export function moveNavigationItem(
  treeData: NavigationTreeNode[],
  sourceKey: string,
  targetKey: string | undefined,
  dropPosition: NavigationDropPosition,
): NavigationTreeNode[] {
  const next = cloneNavigationTree(treeData);
  const find = (
    nodes: NavigationTreeNode[],
    key: string,
  ): { nodes: NavigationTreeNode[]; index: number } | undefined => {
    for (let index = 0; index < nodes.length; index++) {
      if (nodes[index].key === key) {
        return { nodes, index };
      }
      const found = find(nodes[index].children ?? [], key);
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  const source = find(next, sourceKey);
  if (!source || sourceKey === targetKey) {
    return treeData;
  }
  const [item] = source.nodes.splice(source.index, 1);
  if (targetKey === undefined) {
    next.push(item);
    return next;
  }
  const target = find(next, targetKey);
  if (!target) {
    return treeData;
  }
  if (dropPosition === 'on') {
    const parent = target.nodes[target.index];
    parent.children = [item, ...(parent.children ?? [])];
  } else {
    target.nodes.splice(target.index + (dropPosition === 'after' ? 1 : 0), 0, item);
  }
  return next;
}
