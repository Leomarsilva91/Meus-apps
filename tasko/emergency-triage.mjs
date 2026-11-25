// Triagem preliminar conservadora. Não concede benefícios nem bloqueia pedidos.
// Negação e contexto ambíguo exigem confirmação; risco crítico não espera IA.
export function classifyEmergency(input) {
 const s=String(input??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const critical=/\b(cheiro de gas|vazamento de gas|incendio|pessoa presa|crianca trancada|sem respirar|risco de vida|choque eletrico|socorro|acidente|fumaca)\b/;
 const vehicle=/\b(carro|moto|veiculo|pneu|pane|guincho)\b/;
 const vulnerability=/\b(rodovia|acostamento|estrada deserta|local isolado|longe da cidade|sozinh[oa]|sem sinal)\b/;
 const urgent=/\b(urgente|vazamento|curto circuito|alagamento|pane|pneu furado|carro quebrado)\b/;
 if(critical.test(s)) return {priority:"critical",officialHelp:true,review:true};
 if(vehicle.test(s)&&vulnerability.test(s)) return {priority:"emergency",officialHelp:false,review:true};
 if(urgent.test(s)) return {priority:"urgent",officialHelp:false,review:true};
 return {priority:"normal",officialHelp:false,review:false};
}
