// Work dates must use the business timezone, never the operator's device timezone.
const partsFormatter=new Intl.DateTimeFormat("en-CA",{
 timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit"
});
export function melbourneToday(now=new Date()){
 const parts=partsFormatter.formatToParts(now);
 const value=type=>parts.find(part=>part.type===type)?.value;
 return `${value("year")}-${value("month")}-${value("day")}`;
}
export function melbourneCurrentMonday(now=new Date()){
 const day=melbourneToday(now);
 const utc=new Date(day+"T00:00:00Z");
 const weekday=utc.getUTCDay();
 utc.setUTCDate(utc.getUTCDate()-(weekday+6)%7);
 return utc.toISOString().slice(0,10);
}
