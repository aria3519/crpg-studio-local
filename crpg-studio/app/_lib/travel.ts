// Words that make a chosen action travel (page.tsx moves the player on them; /api/gm drops a choice that names a place without one).
// Connective forms count ("그림우드로 들어가 흔적을 쫓는다" was left at 북문 초소); promises in talk ("나가겠습니다") don't.
export const TRAVEL_VERB = /(간다|향한다|향해|향하며|이동한다|이동해|이동하며|돌아가|찾아가|가서|떠난다|떠나 |출발한다|가 ?본다|로 가 |로 가며|(들어|나|건너|올라|내려|달려|걸어|뛰어|넘어)가 |나선다|들른다|들러 |다녀온다)/;
