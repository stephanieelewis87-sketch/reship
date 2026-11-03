// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { contextsFor, insertInto, platformFor } from "./templates";

describe("comment-box templates", () => {
  it("only runs on Poshmark and Depop", () => {
    expect(platformFor("poshmark.com")).toBe("Poshmark");
    expect(platformFor("www.depop.com")).toBe("Depop");
    expect(platformFor("www.vinted.com")).toBeNull();
    expect(platformFor("notposhmark.com")).toBeNull();
  });

  it("offers order templates on Poshmark order pages and bundle templates elsewhere", () => {
    expect(contextsFor("Poshmark", "/order/sales/abc")).toEqual(["pastBuyer"]);
    expect(contextsFor("Poshmark", "/bundles/shop")).toEqual(["bundle"]);
    expect(contextsFor("Depop", "/messages/")).toEqual(["potentialBuyer", "pastBuyer"]);
  });

  it("types into a comment box and tells the page, without submitting", () => {
    const form = document.createElement("form");
    const box = document.createElement("textarea");
    form.appendChild(box);
    document.body.appendChild(form);
    let inputs = 0;
    let submits = 0;
    box.addEventListener("input", () => inputs++);
    form.addEventListener("submit", () => submits++);
    insertInto(box, "Hi there!");
    expect(box.value).toBe("Hi there!");
    insertInto(box, "Thanks.");
    expect(box.value).toBe("Hi there! Thanks.");
    expect(inputs).toBe(2);
    expect(submits).toBe(0);
  });
});
