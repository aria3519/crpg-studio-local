// The big cities' shop (user 2026-11-27): gear from the gear table up to one grade above what foes of the hero's level
// carry, the next grade shown locked with the level it opens at, and healing potions.
// Prices follow what saves actually hold (Lv.12 ≈ 200–400 골드, Lv.38 ≈ 1,400, Lv.66 ≈ 6,400): the top grade on sale is
// about one piece's worth of a hero's purse at that level.
import { GEAR_TABLE, type GearRow } from './gear-table';
import { gradeForTier, GRADE_LABELS, type Grade, type ItemInfo } from './items';
import { startGold, wearNew, type Game, type Session } from './game/core';
import { tierOfLevel } from './progression';

export const SHOP_PRICE = [40, 120, 350, 1200, 5000, 12000];
export const shopTop = (level: number) => Math.min(5, gradeForTier(tierOfLevel(Math.max(1, level))) + 1) as Grade;
export const unlockLevel = (grade: number) => { for (let l = 1; l <= 100; l++) if (shopTop(l) >= grade) return l; return 100; };
// Within a grade a stronger piece costs more (±15%), so the shelf isn't one price.
const score = (r: GearRow) => r[3] * 3 + r[4] + r[5] * 3 + r[6] / 4;
export const priceOf = (r: GearRow) => {
  const peers = GEAR_TABLE.fantasy.filter(p => p[1] === r[1] && p[2] === r[2]).map(score).sort((a, b) => a - b);
  const rank = peers.length > 1 ? peers.indexOf(score(r)) / (peers.length - 1) : 0.5;
  return Math.round(SHOP_PRICE[r[2]] * (0.85 + 0.3 * rank) / 10) * 10;
};
export const potionPrice = (level: number) => 15 + 3 * Math.max(1, level);
// locked: the level the piece opens at (0 when on sale). Pieces the hero owns or can't use aren't shelved.
export type ShopRow = { row: GearRow; price: number; locked: number };
export const shopStock = (genre: string, level: number, fits: (name: string, kind: GearRow[1]) => boolean, owned: (name: string) => boolean): ShopRow[] => {
  const top = shopTop(level), rows = GEAR_TABLE[genre as keyof typeof GEAR_TABLE] || GEAR_TABLE.fantasy;
  return rows.filter(r => r[2] >= Math.max(1, top - 1) && r[2] <= Math.min(5, top + 1) && fits(r[0], r[1]) && !owned(r[0]))
    .map(r => ({ row: r, price: priceOf(r), locked: r[2] > top ? unlockLevel(r[2]) : 0 }))
    .sort((a, b) => a.locked - b.locked || b.row[2] - a.row[2] || a.price - b.price)
    // The locked grade is a preview: its cheapest piece of each kind.
    .filter((x, i, all) => !x.locked || all.findIndex(y => y.locked && y.row[1] === x.row[1]) === i);
};

// A bought piece goes into the bag and on, when it raises 전투력 (wearNew); a potion just into the bag.
export const buyFromShop = (g: Game, s: Session, name: string, info: ItemInfo, price: number): Session | undefined => {
  const purse = s.characterGold ?? startGold(g);
  if (purse < price || s.mode) return undefined;
  const next: Session = { ...s, characterGold: purse - price, inventory: [...(s.inventory || []), name], itemInfo: { ...(s.itemInfo || {}), [name]: info },
    log: [...s.log, `시스템: 구매 — ${info.grade ? `[${GRADE_LABELS[info.grade]}] ` : ''}${name} · 골드 -${price.toLocaleString('ko-KR')} (보유 ${(purse - price).toLocaleString('ko-KR')})`] };
  return wearNew(g, next, [name]);
};
