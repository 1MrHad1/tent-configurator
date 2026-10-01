// @ts-check
/**
 * Reference Cart Transform Function (Shopify Plus `lineUpdate`), not deployed in this demo.
 *
 * Sets each configured line's price to the quoted unit price carried in its properties, so
 * checkout charges what the pricing API computed rather than the variant's base price.
 *
 * Functions run sandboxed with no network access, so this function trusts the attribute and the
 * integrity check lives where it can call the pricing service: an `orders/create` webhook
 * posts the line's quote fields to POST /api/quote/verify and holds fulfilment on a mismatch.
 * (On non-Plus stores, the same quote can instead create a Draft Order with a custom price.)
 *
 * @param {{ cart: { lines: Array<{ id: string, quantity: number, unitPrice?: { value?: string }, currency?: { value?: string }, signature?: { value?: string } }> } }} input
 */
export function run(input) {
  const operations = input.cart.lines
    .filter((line) => line.unitPrice?.value && line.signature?.value)
    .map((line) => ({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: (Number(line.unitPrice.value) / 100).toFixed(2) },
          },
        },
      },
    }));
  return { operations };
}
