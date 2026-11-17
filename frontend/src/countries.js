// ISO 3166-1 alpha-2 countries, with French names provided by the browser.
const ISO_CODES = "AW AF AO AI AX AL AD AE AR AM AS AQ TF AG AU AT AZ BI BE BJ BQ BF BD BG BH BS BA BL BY BZ BM BO BR BB BN BT BV BW CF CA CC CH CL CN CI CM CD CG CK CO KM CV CR CU CW CX KY CY CZ DE DJ DM DK DO DZ EC EG ER EH ES EE ET FI FJ FK FR FO FM GA GB GE GG GH GI GN GP GM GW GQ GR GD GL GT GF GU GY HK HM HN HR HT HU ID IM IN IO IE IR IQ IS IL IT JM JE JO JP KZ KE KG KH KI KN KR KW LA LB LR LY LC LI LK LS LT LU LV MO MF MA MC MD MG MV MX MH MK ML MT MM ME MN MP MZ MR MS MQ MU MW MY YT NA NC NE NF NG NI NU NL NO NP NR NZ OM PK PA PN PE PH PW PG PL PR KP PT PY PS PF QA RE RO RU RW SA SD SN SG GS SH SJ SB SL SV SM SO PM RS SS ST SR SK SI SE SZ SX SC SY TC TD TG TH TJ TK TM TL TO TT TN TR TV TW TZ UG UA UM UY US UZ VA VC VE VG VI VN VU WF WS YE ZA ZM ZW".split(" ");
const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
export const COUNTRIES = ISO_CODES.map(code => ({ code, name: displayNames.of(code) }))
  .sort((a,b) => a.name.localeCompare(b.name, "fr"));

export const CITIES_BY_COUNTRY = {
  CD: ["Kinshasa","Lubumbashi","Mbuji-Mayi","Kananga","Kisangani","Bukavu","Goma","Kolwezi","Likasi","Matadi","Boma","Kikwit","Bandundu","Tshikapa","Bunia","Butembo","Beni","Uvira","Kalemie","Kindu","Mbandaka","Gemena","Isiro","Gbadolite","Kamina","Mwene-Ditu","Kabinda","Lodja","Inongo","Boende","Lisala","Buta","Kasumbalesa","Kenge","Zongo","Muanda","Bumba","Kasongo","Kongolo","Fizi"],
  CG: ["Brazzaville","Pointe-Noire","Dolisie","Nkayi","Ouesso","Owando","Impfondo"],
  AO: ["Luanda","Benguela","Huambo","Lubango","Cabinda","Malanje","Soyo"],
  RW: ["Kigali","Butare","Gisenyi","Musanze","Muhanga","Rwamagana"],
  BI: ["Bujumbura","Gitega","Ngozi","Rumonge"],
  UG: ["Kampala","Entebbe","Jinja","Gulu","Mbarara"],
  TZ: ["Dar es Salaam","Dodoma","Arusha","Mwanza","Mbeya","Kigoma"],
  ZM: ["Lusaka","Ndola","Kitwe","Livingstone","Kasama"],
  CF: ["Bangui","Berbérati","Bambari","Bossangoa"],
  SS: ["Djouba","Wau","Malakal","Bor"],
  FR: ["Paris","Marseille","Lyon","Toulouse","Nice","Bordeaux","Lille","Nantes","Strasbourg"],
  BE: ["Bruxelles","Anvers","Liège","Gand","Charleroi","Namur"],
  CA: ["Montréal","Toronto","Ottawa","Québec","Vancouver","Calgary"],
  US: ["New York","Washington","Los Angeles","Chicago","Houston","Atlanta","Miami"],
  GB: ["Londres","Manchester","Birmingham","Liverpool","Leeds"],
  ZA: ["Johannesburg","Le Cap","Pretoria","Durban","Gqeberha"],
  KE: ["Nairobi","Mombasa","Kisumu","Nakuru"],
  CI: ["Abidjan","Yamoussoukro","Bouaké","San-Pédro"],
  SN: ["Dakar","Thiès","Saint-Louis","Kaolack"],
  CM: ["Douala","Yaoundé","Garoua","Bafoussam"],
  NG: ["Lagos","Abuja","Kano","Ibadan","Port Harcourt"],
  MA: ["Casablanca","Rabat","Marrakech","Fès","Tanger"],
  DE: ["Berlin","Munich","Hambourg","Francfort","Cologne"],
  AE: ["Dubaï","Abou Dabi","Charjah"],
  TR: ["Istanbul","Ankara","Izmir","Antalya"],
  CN: ["Pékin","Shanghai","Guangzhou","Shenzhen"],
  IN: ["New Delhi","Mumbai","Bangalore","Chennai"],
};
export function countryName(code) { return COUNTRIES.find(country=>country.code===code)?.name || ""; }
export function countryCode(name) { return COUNTRIES.find(country=>country.name===name)?.code || ""; }
