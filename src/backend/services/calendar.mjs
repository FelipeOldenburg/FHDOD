const hospitalDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const hospitalDay = (timestamp) =>
  timestamp ? hospitalDateFormatter.format(new Date(timestamp)) : "";
