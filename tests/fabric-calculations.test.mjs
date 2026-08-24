import assert from "node:assert/strict";
import test from "node:test";

import {
  fabricConsumption,
  fabricConsumptionKg,
  fabricConsumptionMeter,
  fabricCostAmount,
  fabricGrossWidthCm,
  sumFabricCosts,
} from "../features/quote-center/model/quote-calculations.ts";
import { createEmptyFabricCostLine } from "../features/quote-center/model/quote-editor-state.ts";

const closeTo = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
};

const fabricLine = (overrides = {}) => ({
  id: "fabric-row-1",
  sourceLibraryItemId: "fabric-combed-cotton",
  name: "精梳棉 40S",
  composition: "100% Cotton",
  segmentLengthCm: 138,
  netWidthCm: 145,
  gsm: 180,
  lossRate: 3,
  supplier: "XX纺织",
  unitPrice: 23.5,
  purchaseUnit: "kg",
  ...overrides,
});

test("KG 面料使用净门幅加 5cm，并按克重和损耗计算单耗", () => {
  const line = fabricLine();
  assert.equal(fabricGrossWidthCm(line.netWidthCm), 150);
  closeTo(fabricConsumptionKg(line), 0.383778);
  closeTo(fabricConsumption(line), 0.383778);
});

test("米制面料先把段长从 cm 转为 m，再计算损耗", () => {
  const line = fabricLine({ purchaseUnit: "meter" });
  closeTo(fabricConsumptionMeter(line), 1.4214);
  closeTo(fabricConsumption(line), 1.4214);
});

test("面料成本始终等于单耗乘单价，汇总不会重复计算损耗", () => {
  const kg = fabricLine();
  const meter = fabricLine({ id: "fabric-row-2", purchaseUnit: "meter" });
  closeTo(fabricCostAmount(kg), 9.018783);
  closeTo(fabricCostAmount(meter), 33.4029);
  closeTo(sumFabricCosts([kg, meter]), 42.421683);
});

test("面料人工数字保持 null 与 0 两种状态，preview 可按相同无损耗结果计算", () => {
  const empty = createEmptyFabricCostLine("fabric-empty");
  const explicitZero = { ...empty, lossRate: 0 };
  assert.equal(empty.lossRate, null);
  assert.equal(explicitZero.lossRate, 0);
  assert.notEqual(empty.lossRate, explicitZero.lossRate);

  const nullLoss = fabricLine({ lossRate: null });
  const zeroLoss = fabricLine({ lossRate: 0 });
  closeTo(fabricConsumptionKg(nullLoss), fabricConsumptionKg(zeroLoss));
  assert.equal(nullLoss.lossRate, null);
  assert.equal(zeroLoss.lossRate, 0);
});
