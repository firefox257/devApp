



globalThis.$=(()=>{
	var def={};
	
	
	var f = ()=>
	{
		console.log("hi")
		
	}
	
	
	/*
	defValue
	{
		public: true/false,
		subscribable:true/false, this is defines if it is one or many if not subscribable then otnis one that has a function alreadyndefined
		returnable: true/fale, this is if by callling has returened values
		secured: true/false, 
		redefinable:true/false, 
		
	}
	
	*/
	f.d= (n, defValue , func)=> {
		def[n]=defValue;
	}
	
	
	f.s=(n, func)=> {
		var d= def[n];
		
	}
	
	return f;
})();

$()