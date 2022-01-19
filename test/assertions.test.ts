import assert from "assert";

export const assertAddressExist = function(address: string) {
    assert.ok(
        typeof(address) !== "undefined" &&
        address.substring(0, 2) === "0x"
      );
}