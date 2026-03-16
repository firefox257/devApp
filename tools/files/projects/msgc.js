



globalThis.$=(()=>{
		var funcs={};


		var f = ()=>
		{
			console.log("hi")

		}
		/*
		defValue
		{
			public: true/false,
			subscribable:true/false, this defines if it is one or many if not subscribable then it is one that has a function already defined
			returnable: true/fale, this is if by callling has returened values
			secured: true/false, 
			redefinable:true/false, 
		}
		*/
		f.d= (n, defValue , func)=> {
			if(funcs[n]== undefined) {
				var o={};
				o.funcs=[];
				if(func) {
					o.funcs.push(func);
				}

				o.def=defValue;
				funcs[n]=o;
				return;
			}
			var ob= funcs[n];
			ob.def=defValue;
			if(func) {
				ob.funcs.push(func);
			}

		}


		f.s=(n, func)=> {


		}

		return f;
	})();

$()