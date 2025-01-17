import USDLemmaABI from './abi/USDLemma.json';
//import xUSDLemmaABI from './abi/xUSDLemma.json'; REVISIT once source code verified
import { USDLemma } from "./contracts/USDLemma";
import { stringify } from "querystring";
// import { XUSDLemma } from './contracts/xUSDLemma';  REVISIT once source code verified


const addresses = {
  USD_LEMMA: '0xdb41ab644AbcA7f5ac579A5Cf2F41e606C2d6abc', //Proxy address but using Implementation ABI 0xb8f9632e8d3cfaf84c254d98aea182a33a9d11bb
  XUSD_Lemma: '0x57c7e0d43c05bce429ce030132ca40f6fa5839d7',
}

const parquet = require('parquetjs');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://arb-mainnet.g.alchemy.com/v2/S6gNm0Rzgv7UBu3ztTC1iDbNX0vhoT9m'));
let failedBlocks: string[] = [];


// Parquet table
let schema = new parquet.ParquetSchema({
  event: { type: 'UTF8' },
  contract_address: { type: 'UTF8' },
  block_number: { type: 'UTF8'},
  tx_hash: { type: 'UTF8'},
  return_values: { type: 'UTF8'},
});

//main function
export const writeToParquet = async (fileName: string) => {
  const latestBlock = await web3.eth.getBlockNumber()
  console.log(latestBlock);
  var writer = await parquet.ParquetWriter.openFile(schema, fileName); //removed await
  await pull_data(writer, 0, latestBlock);
  await writer.close();
}

//main data function
async function pull_data(writer, startBlock = 0, latestBlock): Promise<void> {
  for (let i = startBlock; i <= latestBlock; i+= 2000) { //used to be 2000
    let fromBlock = i
    let toBlock = i + 1999
    if (fromBlock % 100000 === 0) {
      console.log("Progress is " + ((fromBlock / latestBlock) * 100).toFixed(2).toString() + "% complete.")
    }
    try {
      await get_data_blocks(writer, fromBlock, toBlock);
    }
    catch(err){
     failedBlocks.push(fromBlock.toString()+","+toBlock.toString())
    }
  }
}

//get data between blocks
async function get_data_blocks(writer, fromBlock: number, toBlock: number,): Promise<void> {
  const USDLemma = new web3.eth.Contract(USDLemmaABI as any, addresses.USD_LEMMA) as unknown as USDLemma;
  //const XUSDLemma = new web3.eth.Contract(xUSDLemmaABI as any, addresses.XUSD_Lemma) as unknown as XUSDLemma;
  const lemmaEvents = await USDLemma.getPastEvents('allEvents', {
      fromBlock: fromBlock,
      toBlock: toBlock //refactor to make sure not pulling extra blocks//currently deduping w/ Pandas
  })

  const appendRows = lemmaEvents.map(evt => { //collecting series of promises as an array...
    return writer.appendRow({
      event: evt.event, //if 'all'
      contract_address: evt.address,
      block_number: evt.blockNumber.toString(),
      tx_hash: evt.transactionHash,
      return_values: stringify(evt.returnValues),
      });
  });
  await Promise.all(appendRows);
}

writeToParquet('data/raw/USDLemma.parquet');
console.log(failedBlocks); //show all failed blocks