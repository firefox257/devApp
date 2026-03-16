



/*

This is a population economy for UBI, universal basic income.
How money is backed by gold, this model sets the backingnofnpeople alive, hence population.
Every person is backed by a large amount like everynperson is backed by $1,000,000 per alive person.
People get a payout of some lump every month. 
total economy money = population * (per person backed amount)
total ubi funding needed = (per person payout)*(population).


Every person pays out A UBI tax in order to derive the payout for people alive.
the ubi tax is ((total person currently has)/(total economic amount))*(total ubi funding).
this first deducted. then the minthly payoutnis added to each person.




*/


/*

Symbol	Definition	Example
P	Population: Total number of living, verified citizens	Dynamic (Increases with births)
V	Asset Value per Person: Fixed monetary value assigned to each human life	$1,000,000
M	Total Money Supply: Total value of the economy	M = P × V
U	Monthly UBI Payout: Fixed cash amount distributed per person per month	Variable (determines convergence speed)
Wᵢ	Individual Wealth: Total currency held by person i	Varies per person
J: Is how much tital UBI costs for the moth

the calculating is incorrect.
here is the corrext calculation.


function ubiTaxCalc(person) {
	var personTaxRate= person.W/M;
	var personToxTotal= personTaxRate * J
	person.W -= personToxTotal;
	person.W +=U;
	
}

update the e html documentation. recalculate all values.
*/

function print(m){
	console.log(m)
}
function printo(m){
	console.log(JSON.stringify(m))
}

var P=700000000000; 
var V =1000000;
var U = 5000;
var M = P* V;
var J = U*P;


function ubiTaxCalc(person) {
	var personTaxRate= person.W/M;
	var personToxTotal= personTaxRate * J
	person.W -= personToxTotal;
	person.W +=U;
	
}

var per={
	W:1000000000,
	tax:[], // sum total
	taxPercent[],//sum of 12 months tax
	
}

var i= 0;
while(per.W>=500000000) {
	i++;
	ubiTaxCalc(per)
}
print(i)