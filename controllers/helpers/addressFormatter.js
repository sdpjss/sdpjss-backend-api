const deliveryAddressFields = [
  "currlocation",
  "country",
  "state",
  "district",
  "city",
  "postoffice",
  "pin",
  "landmark",
  "street",
  "apartment",
  "floor",
  "room",
];

const normalizeDeliveryAddress = (address = {}) =>
  Object.fromEntries(
    deliveryAddressFields.map((field) => [
      field,
      typeof address[field] === "string" ? address[field].trim() : "",
    ])
  );

const formatStructuredAddress = (
  address = {},
  { includeLabels = false } = {}
) =>
  [
    address.room
      ? includeLabels
        ? `Room-${address.room}`
        : address.room
      : "",
    address.floor
      ? includeLabels
        ? `Floor-${address.floor}`
        : address.floor
      : "",
    address.apartment,
    address.street,
    address.landmark,
    address.postoffice
      ? includeLabels
        ? `PO: ${address.postoffice}`
        : address.postoffice
      : "",
    address.city,
    address.district,
    address.state,
    address.country,
    address.pin
      ? includeLabels
        ? `PIN: ${address.pin}`
        : address.pin
      : "",
  ]
    .filter(Boolean)
    .join(", ");

export { formatStructuredAddress, normalizeDeliveryAddress };
