import { Blueprint } from "./blueprint"

const plutus = await Bun.file("./plutus.json").json() as Blueprint

function getValidator(name: string){
    return plutus.validators.filter((x)=>x.title==name)[0]
}

console.log("Sizes: ")
console.log(`Vesting: ${getValidator("btn.vest").compiledCode.length / 2}`)
console.log(`Btn: ${getValidator("btn.mint").compiledCode.length / 2}`)
console.log(`Sale: ${getValidator("sale.collect").compiledCode.length / 2}`)