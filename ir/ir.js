/*
Copyright (c) 2011 Cimaron Shanahan

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE		 OR OTHER DEALINGS IN THE SOFTWARE.
*/


/**
 * IR Class
 *
 * Stores IR code tree
 */	
function Ir(target) {

	this.target = target;

	this.symbols = {
		uniform : {
			next : 0,
			entries : {}
		},
		attribute : {
			next : 0,
			entries : {}
		},
		varying : {
			next : 0,
			entries : {}
		},
		temp : {
			next : 0
		}
	};

	this.code = [];
	this.last = null;
}

Ir.prototype.getTemp = function(n) {
	var t;

	n = n || 1;
	t = 'temp@' + this.symbols.temp.next;

	this.symbols.temp.next += n;

	return t;
};

/**
 * Add a symbol table entry into the local symbol table and return a new IR identifier
 *
 * @param   object   entry   Symbol table entry
 *
 * @return  string
 */
Ir.prototype.getUniform = function(entry) {

	var table = this.symbols.uniform, out;

	if (!table.entries[entry.name]) {
		table.entries[entry.name] = entry;
		entry.out = 'uniform@' + table.next;
		table.next += entry.getType().slots;
	}

	return entry.out;
};

/**
 * Add a symbol table entry into the local symbol table and return a new IR identifier
 *
 * @param   object   entry   Symbol table entry
 *
 * @return  string
 */
Ir.prototype.getAttribute = function(entry) {

	var table = this.symbols.attribute, out;

	if (!table.entries[entry.name]) {
		table.entries[entry.name] = entry;
		entry.out = 'attribute@' + table.next;
		table.next += entry.getType().slots;
	}

	return entry.out;
};

/**
 * Add a symbol table entry into the local symbol table and return a new IR identifier
 *
 * @param   object   entry   Symbol table entry
 *
 * @return  string
 */
Ir.prototype.getVarying = function(entry) {

	var table = this.symbols.varying, out;

	if (!table.entries[entry.name]) {
		table.entries[entry.name] = entry;
		entry.out = 'varying@' + table.next;
		table.next += entry.getType().slots;
	}

	return entry.out;
};


Ir.prototype.get = function(i) {
	return this.code[i];	
};

Ir.prototype.push = function(ir) {
	this.code.push(ir);
	this.last = ir;
};

Ir.isSwizzle = function(swz) {

	if (swz.match(/[xyzw]+/)) {
		return true;	
	}

	if (swz.match(/[rgba]+/)) {
		return true;	
	}

	if (swz.match(/[stpq]+/)) {
		return true;	
	}
};

Ir.normalizeSwizzle = function(swz) {
	var n;

	if (!this.isSwizzle(swz)) {
		return null;
	}
	
	n = swz
	   .replace(/[rs]/g, 'x')
	   .replace(/[gt]/g, 'y')
	   .replace(/[bp]/g, 'z')
	   .replace(/[aq]/g, 'w')
	   ;

	return n;
};

/**
 * Validate a set of components against a list of valid components
 */
Ir.matchComponents = function(src, list) {
	var regex;
	
	regex = new RegExp("^[" + list + "]*$");
	
	return regex.test(src);
};

Ir.swizzles = ["xyzw", "rgba", "stpq"];


/**
 * Replaces all instances of an operand name and base index in all instructions after start
 *
 * @param   integer     Starting instruction number
 * @param   string      Old name to search for
 * @param   string      New name to replace with
 * @param   integer     Add offset
 * @param   boolean     True if replacing with a completely new operand
 */
Ir.prototype.replaceName = function(start, old, nw, index, repl) {
	var i, j, ir, f, name, neg_const;
	neg_const = old.match(/^\-([0-9]+\.[0-9]+)/);
	if (neg_const) {
		old = neg_const[1];
		neg_const = true;
	}

	for (i = start; i < this.code.length; i++) {
		ir = this.code[i];

		//foreach each operand field
		for (j = 0; j < IR.operands.length; j++) {
			f = IR.operands[j];
			if (ir[f] && ir[f].name == old) {
				if (repl) {
					ir[f] = new Ir.Operand(ir[f].neg + nw);
				} else {
					ir[f].name = nw;
					ir[f].addOffset(index);
				}
				if (neg_const && ir[f].neg) {
					ir[f].neg = "";
				}
			}	
		}
		
	}
};
	
Ir.prototype.toString = function() {
	return this.code.join("\n");
};


/**
 * Builds instructions from code table record
 *
 * @param   array       List of instruction strings
 * @param   array       List of operands
 */
Ir.prototype.build = function(code, oprds) {
	var dest, i, j, k, o, n, t, oprd, ir, new_swz, temps;

	//Parse operands
	for (i = 0; i < oprds.length; i++) {

		oprd = new IrOperand(oprds[i]);

		if (oprd.swizzle) {

			//need a new temp to move the swizzle so our code pattern works
			new_swz = Ir.swizzles[0].substring(0, oprd.swizzle.length);

			if (oprd.swizzle != new_swz) {
				dest = this.getTemp();
				ir = new IrInstruction('MOV', util.format("%s.%s", dest, new_swz), oprd.full);
				this.push(ir);
				oprd = new IrOperand(dest);
			}
		}

		oprds[i] = oprd;
	}

	temps = [];

	//Merge template with passed operands
	for (i = 0; i < code.length; i++) {

		ir = new IrInstruction(code[i]);

		//For each operand
		for (j = 0; j < IrInstruction.operands.length; j++) {		
			
			o = IrInstruction.operands[j];
			oprd = ir[o];
			
			if (!oprd) {
				break;
			}

			//Normal src/dest
			n = oprd.name.match(/%(\d+)/);
			if (n) {
				n = parseInt(n[1]);
				ir[o] = new IrOperand(oprds[n - 1].toString());
				ir[o].addOffset(oprd.address);
				ir[o].swizzle = oprd.swizzle;
				ir[o].neg = oprd.neg;
			}
			
			//Need temp
			t = oprd.name.match(/%t(\d+)/);
			if (t) {

				//Build up enough temps
				t = parseInt(t[1]);
				while (temps.length < t) {
					temps.push(this.getTemp());	
				}
				t = temps[t - 1].split('@');
				
				oprd.name = t[0];
				oprd.address = t[1];
				oprd.full = oprd.toString();
			}
			
		}

		this.push(ir);
	}
};


/**
 * Ir Error Class
 *
 * Used to differentiate between a compilation error and a compiler error
 */
function IrError(msg) {
	this.msg = msg;
	this.ir = true;
}
IrError.prototype = Error.prototype;





