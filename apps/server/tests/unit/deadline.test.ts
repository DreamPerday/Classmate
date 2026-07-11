import { describe, expect, it } from "vitest";
import { resolveDeadline } from "../../src/knowledge/deadline.js";

describe("resolveDeadline",()=>{
  it("resolves next-week weekday from the current Chinese calendar week",()=>{const result=resolveDeadline("下周五晚上八点之前",new Date(2026,6,11,16));const value=new Date(result.resolved!);expect([value.getFullYear(),value.getMonth(),value.getDate(),value.getHours(),value.getMinutes()]).toEqual([2026,6,17,20,0]);expect(result.needsReview).toBe(false);});
  it("moves next-week weekday forward a full week when spoken on Monday",()=>{const result=resolveDeadline("下周五",new Date(2026,6,13,9));const value=new Date(result.resolved!);expect([value.getFullYear(),value.getMonth(),value.getDate()]).toEqual([2026,6,24]);});
  it("uses the next occurrence for a weekday without a week qualifier",()=>{const result=resolveDeadline("周五之前",new Date(2026,6,11,16));const value=new Date(result.resolved!);expect([value.getFullYear(),value.getMonth(),value.getDate()]).toEqual([2026,6,17]);});
  it("parses Chinese half-hour expressions",()=>{const result=resolveDeadline("明天上午九点半",new Date(2026,6,11,16));const value=new Date(result.resolved!);expect([value.getDate(),value.getHours(),value.getMinutes()]).toEqual([12,9,30]);});
});
