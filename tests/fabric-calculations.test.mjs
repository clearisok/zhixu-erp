import assert from "node:assert/strict";
import test from "node:test";

import {
  fabricConsumption,
  fabricConsumptionKg,
  fabricConsumptionMeter,
  fabricCostAmount,
  fabricGrossWidthCm,
  normalizeFabricConsumption,
  roundTo,
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
  closeTo(fabricConsumptionKg(line), 0.3838);
  closeTo(fabricConsumption(line), 0.3838);
});

test("米制面料先把段长从 cm 转为 m，再计算损耗", () => {
  const line = fabricLine({ purchaseUnit: "meter" });
  closeTo(fabricConsumptionMeter(line), 1.4214);
  closeTo(fabricConsumption(line), 1.4214);
});

test("面料成本始终等于单耗乘单价，汇总不会重复计算损耗", () => {
  const kg = fabricLine();
  const meter = fabricLine({ id: "fabric-row-2", purchaseUnit: "meter" });
  closeTo(fabricCostAmount(kg), 9.0193);
  closeTo(fabricCostAmount(meter), 33.4029);
  closeTo(sumFabricCosts([kg, meter]), 42.4222);
});

test("面料单耗在计算边界按第五位四舍五入为四位正式业务值", () => {
  assert.equal(normalizeFabricConsumption(0.7263827), 0.7264);
  assert.equal(normalizeFabricConsumption(0.72634), 0.7263);
  assert.equal(normalizeFabricConsumption(0.72635), 0.7264);
  assert.equal(normalizeFabricConsumption(0.726349999), 0.7263);
  assert.equal(normalizeFabricConsumption(0.99995), 1);
  assert.equal(roundTo(0.7, 4), 0.7);
});

test("kg 与 meter 单耗及成本共用四位正式值", () => {
  const kg = fabricLine();
  const meter = fabricLine({ purchaseUnit: "meter", segmentLengthCm: 123.4567, lossRate: 0 });
  assert.equal(fabricConsumption(kg), 0.3838);
  assert.equal(fabricCostAmount(kg), 0.3838 * 23.5);
  assert.equal(fabricConsumption(meter), 1.2346);
  assert.equal(fabricCostAmount(meter), 1.2346 * 23.5);
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
