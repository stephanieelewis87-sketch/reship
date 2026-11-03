// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { needsShipping, readInProgressIds, readOrderPage, readQrCode, shipmentStatus, soldDate, toImportedOrder } from "./mercari";

// Trimmed copy of the structure of Mercari's order status page (made-up order).
const ORDER_PAGE = `
<div aria-label="inactive" data-testid="TimelineStep"><h4 data-testid="TimelineStepName">Sold</h4></div>
<div aria-label="active" data-testid="TimelineStep"><h1 data-testid="TimelineStepName">Send this order</h1>
  <button data-testid="TimelineActionButton-confirm_shipment_modal">Confirm as sent</button>
  <button data-testid="TimelineActionButton-qr_code_modal">Open QR code</button></div>
<div aria-label="inactive" data-testid="TimelineStep"><h4 data-testid="TimelineStepName">Delivery</h4></div>
<div data-testid="ArrivalAddressBlock"><p data-testid="ArrivalAddressBlock-Line">Austin, TX</p></div>
<div data-testid="CarrierBlock"><span data-testid="CarrierBlock-Text">USPS Ground Advantage / 2 lb
  <a href="/us/help_center/article/596/">Shipping instructions</a></span></div>
<div data-testid="ShippingCTA"><a data-testid="ShippingCTAButton" href="https://www.mercari.com/shipping/label/?id=abc&amp;token=def&amp;sc=1">Open label</a></div>
<div data-testid="UserInfoAndChat"><a data-testid="UserNameLink" href="/u/1/"><p>janedoe</p></a></div>
<div data-testid="OrderSummary"><div data-testid="ItemInfo">
  <a data-testid="ItemThumbImage" href="/us/item/m12345678901/"><div style="background-image: url(&quot;https://u-mercari-images.mercdn.net/thumb/photos/m12345678901_1.jpg&quot;);"></div></a>
  <a data-testid="ItemNameLink" href="/us/item/m12345678901/">Knit Cardigan Size M</a>
  <p data-testid="ItemSoldTime">Sold on 10/22/26</p><p data-testid="ItemPrice">$28.80</p></div></div>
<div data-testid="OrderDetails-Field"><p data-testid="OrderDetails-Value">m12345678901</p></div>`;

describe("Mercari connector", () => {
  beforeEach(() => {
    document.body.innerHTML = ORDER_PAGE;
  });

  it("reads an order status page", () => {
    const page = readOrderPage()!;
    expect(page).toMatchObject({
      itemId: "m12345678901",
      step: "Send this order",
      hasQrCode: true,
      buyer: "janedoe",
      carrier: "USPS Ground Advantage / 2 lb",
      soldOn: "Sold on 10/22/26",
      labelUrl: "https://www.mercari.com/shipping/label/?id=abc&token=def&sc=1",
    });
    expect(page.items).toEqual([
      { name: "Knit Cardigan Size M", photo: "https://u-mercari-images.mercdn.net/thumb/photos/m12345678901_1.jpg", price: "$28.80" },
    ]);
    expect(needsShipping(page)).toBe(true);
    expect(shipmentStatus(page)).toBe("label_created");
  });

  it("turns the page into an order with its label link", () => {
    const order = toImportedOrder(readOrderPage()!);
    expect(order).toMatchObject({ platform: "Mercari", orderNumber: "m12345678901", buyer: "janedoe", date: "2026-10-22", carrier: "USPS Ground Advantage" });
    expect(order.items[0]).toMatchObject({ name: "Knit Cardigan Size M", price: 28.8 });
    expect(order.labelUrl).toContain("/shipping/label/");
  });

  it("waits while the page is still loading", () => {
    document.body.innerHTML = "<div>Loading</div>";
    expect(readOrderPage()).toBeNull();
  });

  it("collects sale ids from the in-progress list", () => {
    document.body.innerHTML = `<a href="/transaction/order_status/m111111111/">A</a><a href="/us/item/m222222222/">B</a><a href="/us/item/m111111111/">A again</a><a href="/help">Help</a>`;
    expect(readInProgressIds()).toEqual(["m111111111", "m222222222"]);
  });

  it("maps Mercari's timeline to shipment tracking", () => {
    const at = (step: string) => shipmentStatus({ ...readOrderPage()!, step });
    expect(at("Delivery")).toBe("in_transit");
    expect(at("Rating")).toBe("delivered");
    expect(at("Rate the buyer")).toBe("delivered");
    expect(at("In transit")).toBe("in_transit");
    expect(at("Complete")).toBe("delivered");
    expect(at("Cancellation requested")).toBeNull();
  });

  it("opens the QR code dialog, then reads the code", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const button = document.querySelector<HTMLElement>('[data-testid="TimelineActionButton-qr_code_modal"]')!;
    let opened = 0;
    button.addEventListener("click", () => {
      opened++;
      document.body.insertAdjacentHTML("beforeend", `<div role="dialog" data-testid="OrderStatusQRCodeDialog"><img data-testid="ShippingQRCode" src="${png}"></div>`);
    });
    expect(readQrCode()).toBeNull();
    expect(readQrCode()).toBe(png);
    expect(opened).toBe(1);
    expect(toImportedOrder({ ...readOrderPage()!, qrCode: png }).qrCode).toBe(png);
  });

  it("reads Mercari sold dates", () => {
    expect(soldDate("Sold on 1/5/27")).toBe("2027-01-05");
  });
});
