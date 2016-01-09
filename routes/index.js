/**
 * Copyright (C) 2015 whphhg
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version. For more information read the
 * complete license in LICENSE.md.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
"use strict";

var fs = require('fs');
var https = require('https');
var crypto = require('crypto');

/**
 * Express framework
 */
var express = require('express');
var router = express.Router();

/**
 * Socket.io on 20123
 */
var http = require('http');
var server = http.createServer(module.exports.app = express());
var io = require('socket.io').listen(server.listen(20123));

/**
 * RPC connection to 127.0.0.1:9195
 */
var rpc = require('node-json-rpc');
    rpc = new rpc.Client({
      port:9195,
      host:'127.0.0.1',
      path:'/',
      strict:true
    });

/**
 * Data object
 */
var cache = {
  'settings':{
    'local_currency':'EUR',
    'stylesheet':'default',
    'hidden':{}
  },
  'wallet_info':{
    'udp_connections':0
  },
  'currencies':{
    'vanilla':{
      'poloniex':0,
      'bittrex':0,
      'average':0
    },
    'local':{
      'date':'',
      'base':'',
      'rates':{}
    }
  },
  'stylesheets':[],
  'accounts':{},
  'watch_addresses':{},
  'trades':[],
  'nodes':{
    'connected':[],
    'endpoints':[],
    'geodata':{}
  },
  'transactions':{
    'log':[],
    'edits':{}
  },
  'incentive_rewards':[
    {'block_number':292000, 'reward_percent':20},
    {'block_number':300200, 'reward_percent':21},
    {'block_number':308900, 'reward_percent':22},
    {'block_number':318000, 'reward_percent':23},
    {'block_number':327500, 'reward_percent':24},
    {'block_number':337500, 'reward_percent':25},
    {'block_number':347900, 'reward_percent':26},
    {'block_number':358800, 'reward_percent':27},
    {'block_number':370100, 'reward_percent':28},
    {'block_number':381900, 'reward_percent':29},
    {'block_number':394100, 'reward_percent':30},
    {'block_number':406800, 'reward_percent':31},
    {'block_number':419900, 'reward_percent':32},
    {'block_number':433400, 'reward_percent':33},
    {'block_number':447400, 'reward_percent':34},
    {'block_number':461800, 'reward_percent':35},
    {'block_number':476700, 'reward_percent':36},
    {'block_number':492000, 'reward_percent':37}
  ]
}

/**
 * 'filename':'cache.properties'
 */
var data_files = {
  'settings':'settings',
  'transactions_edits':'transactions.edits',
  'watch_addresses':'watch_addresses',
  'currencies':'currencies',
  'nodes_geodata':'nodes.geodata'
}

/**
 * Create data/ directory if it doesn't exist already
 */
if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

/**
 * Read data files
 */
for (var filename in data_files) {
  (function(filename, properties) {
    fs.stat('data/' + filename + '.json', function(err, stats) { 
      if (err) {
        /**
         * ENOENT = no such file / dir
         */
        if (err.code !== 'ENOENT') {
          console.log('FS.STAT data/' + filename + '.json ERROR\n\n', err);
          return;
        }
      } else {
        if (stats.size !== 0) {
          fs.readFile('data/' + filename + '.json', function(err, data) {
            if (err) {
              console.log('FS.READ data/' + filename + '.json ERROR\n\n', err);
              return;
            }

            if (properties.length === 2) {
              cache[properties[0]][properties[1]] = JSON.parse(data);
            } else {
              cache[properties] = JSON.parse(data);
            }
          });
        }
      }
    });
  })(filename, data_files[filename].split('.'));
}

/**
 * Update stylesheets array
 */
fs.readdir('public/stylesheets', function(err, files) {
  if (err) {
    console.log('FS.READDIR public/stylesheets ERROR\n\n', err);
    return;
  }

  if (!cache.settings.stylesheet) {
    cache.settings.stylesheet = 'default';
  }

  cache.stylesheets = files;
});

/**
 * Get foreign exchange rates published by the European Central Bank (base USD)
 */
https.get('https://api.fixer.io/latest?base=USD', function(response) {
  if (response.headers['content-type'] === 'application/json') {
    var buffer = '';

    response.on('data', function(data) {
      buffer += data;
    });

    response.on('end', function() {
      var exchange_rates = JSON.parse(buffer);

      if (exchange_rates.hasOwnProperty('date') && exchange_rates.hasOwnProperty('base') && exchange_rates.hasOwnProperty('rates')) {
        /**
         * Check if response is newer
         */
        if (exchange_rates.date !== cache.currencies.local.date) {
          cache.currencies.local.date = exchange_rates.date;
          cache.currencies.local.base = exchange_rates.base;

          for (var i in exchange_rates.rates) {
            cache.currencies.local.rates[i] = {
              'rate':exchange_rates.rates[i]
            };
          }

          /**
           * Because USD is used as base set its rate to 1
           */
          cache.currencies.local.rates.USD = {
            'rate':1
          };
        }
      }
    });
  }
}).on('error', function(error) {
  console.log('HTTPS api.fixer.io/latest?base=USD ERROR\n\n', error);
  return;
});

/**
 * On socket connection
 */
io.on('connection', function(socket) {
  /**
   * Set settings
   */
  socket.on('settings_set', function(set) {
    switch (set.property) {
      case 'hidden':
        cache.settings.hidden[set.hash] = set.value;
        break;
      case 'local_currency':
        cache.settings.local_currency = set.value;
        socket.emit('currency_info', {
          'code':cache.settings.local_currency,
          'btc':cache.currencies.local.rates[cache.settings.local_currency].btc,
          'vanilla_average':cache.currencies.vanilla.average
        });
        break;
      default:
        cache.settings[set.property] = set.value;
        break;
    }

    fs.writeFile('data/settings.json', JSON.stringify(cache.settings, null, 2), function(error) {
      if (error) {
        console.log('FS.WRITE data/settings.json (settings_set) ERROR\n\n', error);
        return;
      }
    });
  });

  /**
   * Encrypt wallet
   */
  socket.on('encryptwallet', function(key) {
    rpc.call({'jsonrpc':'2.0', 'method':'encryptwallet', 'params':[key], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC encryptwallet ERROR\n\n', error);
        return;
      }

      socket.emit('alerts', 'Wallet successfuly encrypted. Restart your main Vanilla wallet.');
    });
  });

  /**
   * Unlock wallet
   */
  socket.on('walletpassphrase', function(passphrase) {
    rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrase', 'params':[passphrase], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC walletpassphrase (unlock) ERROR\n\n', error);
        return;
      }

      if (response.hasOwnProperty('result')) {
        rpc_walletpassphrase();
      } else {
        socket.emit('alerts', "The passphrase you've entered is incorrect.");                
      }
    });
  });

  /**
   * Lock wallet
   */
  socket.on('walletlock', function() {
    rpc.call({'jsonrpc':'2.0', 'method':'walletlock', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC walletlock ERROR\n\n', error);
        return;
      }

      rpc_walletpassphrase();
    });
  });

  /**
   * Send requested object
   */
  socket.on('cache_send', function(properties) {
    var properties = properties.split('.');

    if (properties.length === 2) {
      socket.emit(properties[0], cache[properties[0]][properties[1]]);
    } else {
      if (properties[0] === 'watch_addresses') {
        socket.emit(properties[0], {
          'hidden':cache.settings.hidden.watchonly,
          'addresses':cache.watch_addresses
        });
      } else if (properties === 'nodes.connected') {
        socket.emit('nodes_connected', cache.connected);
      } else {
        socket.emit(properties[0], cache[properties[0]]);
      }
    }
  });

  /**
   * Re-send responses
   */
  socket.on('refresh', function() {
    check_watchaddresses();
    rpc_listreceivedby();
    rpc_listsinceblock();
  });

  /**
   * REDO: Check if the address is valid before transfering coins
   */
                          socket.on('validateaddress', function(params) {
                              var address = params[0];
                              var amount = params[1];

                              rpc.call({"jsonrpc": "2.0", "method": "validateaddress", "params": [address], "id": 0}, function(err, res) {
                                  if (err) { console.log(err); }

                                  if (res.result['isvalid']) {
                                      socket.emit('transfer_possible', [address, amount]);
                                  } else {
                                      socket.emit('alerts', "The address you're trying to send to is not valid.");
                                  }
                              });
                          });

  /**
   * REDO: Send amount to address
   */
                          socket.on('sendtoaddress', function(params) {
                              var address = params[0];
                              var amount = params[1];

                              rpc.call({"jsonrpc": "2.0", "method": "sendtoaddress", "params": [address, amount], "id": 0}, function(err, res) {
                                  if (err) { console.log(err); }

                                  if (res.error) {
                                      /**
                                       * error_code_type_error = -3, NaN or negative
                                       */
                                      if (res.error['code'] == -3) {
                                          socket.emit('alerts', "You're trying to send an invalid amount (" + amount + ").");
                                      }
                                      /**
                                       * error_code_wallet_error = -4, not enough funds
                                       */
                                      else if (res.error['code'] == -4) {
                                          socket.emit('alerts', "You have insufficient funds.");
                                      }
                                      /**
                                       * error_code_wallet_unlock_needed = -13, wallet locked
                                       */
                                      else if (res.error['code'] == -13) {
                                          socket.emit('alerts', 'Wallet is locked. Unlock it if you want to transfer funds.');
                                      }
                                      /**
                                       * error_code_amount_too_small = -101, amount too small
                                       */
                                      else if (res.error['code'] == -101) {
                                          socket.emit('alerts', 'Amount too small.');
                                      } else {
                                          console.log(res.error);
                                      }
                                  } else {
                                      socket.emit('alerts', "Sent " + amount + " VNL to " + address + " (txid: " + res.result + ").");

                                      rpc_listsinceblock();
                                  }
                              }); 
                          });

  /**
   * Get new receiving address
   */
  socket.on('getnewaddress', function(account) {
    rpc.call({'jsonrpc':'2.0', 'method':'getnewaddress', 'params':[account], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC getnewaddress ERROR\n\n', error);
        return;
      }

      rpc_listreceivedby();
    });
  });

  /**
   * Import a valid private key
   */
  socket.on('importprivkey', function(add) {
    rpc.call({'jsonrpc':'2.0', 'method':'importprivkey', 'params':[add.key, add.account], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC importprivkey ERROR\n\n', error);
        return;
      }

      if (response.hasOwnProperty('error')) {
        /**
         * error_code_wallet_error = -4
         */
        if (response.error.code === -4) {
          socket.emit('alerts', "The private key you're trying to import is already in your wallet.");
        }

        /**
         * error_code_invalid_address_or_key = -5
         */
        if (response.error.code === -5) {
          socket.emit('alerts', "The private key you're trying to import is invalid.");
        }
      } else {
        socket.emit('alerts', 'Private key successfully imported.');
        socket.emit('importprivkey_response', true);
        rpc_listreceivedby();
      }
    });
  });

  /**
   * Add new watch-only address
   */
  socket.on('addwatchaddress', function(add) {
    rpc_validateaddress(add.address, function(response) {
      if (response.isvalid && !response.ismine && !cache.watch_addresses[add.address]) {
        cache.watch_addresses[add.address] = {
          'title':add.title,
          'balance':-1
        };

        check_watchaddresses();
      } else if (response.ismine) {
        socket.emit('alerts', "The watch only address you've entered is already in your wallet.");
      } else if (cache.watch_addresses[add.address]) {
        socket.emit('alerts', "The watch only address you've entered is already on the list.");
      } else {
        socket.emit('alerts', "The watch only address you've entered is not a valid address.");
      }
    });
  });

  /**
   * Retrieve incentive reward % based on provided block number
   */
  socket.on('incentive_reward', function(block_number) {
    for (var i in cache.incentive_rewards) {
      if (block_number < cache.incentive_rewards[i].block_number) {
        socket.emit('incentive_reward_response', cache.incentive_rewards[i].reward_percent - 1);
        break;
      }

      if (parseInt(i) === cache.incentive_rewards.length - 1) {
        socket.emit('incentive_reward_response', cache.incentive_rewards[i].reward_percent);
      }
    }
  });

  /**
   * Dump transaction history to a .csv file
   */
  socket.on('dumptxhistory', function() {
    /**
     * Use createWriteStream in case of a large tx history
     */
    var tx_history_csv = fs.createWriteStream('transaction_history.csv');

    tx_history_csv.on('error', function(error) {
      console.log('CSV dumptxhistory ERROR\n\n', error);
      return;
    });

    /**
     * Write column names
     */
    tx_history_csv.write('account, address, category, amount, confirmations, blockhash, blockindex, blocktime, txid, time, timereceived\n');

    cache.transactions.log.forEach(function(tx) {
      var blocktime = new Date(tx.blocktime);
      var time = new Date(tx.time);
      var timereceived = new Date(tx.timereceived);

      /**
       * Write row
       */
      tx_history_csv.write(
        tx.account + ', ' +
        tx.address + ', ' +
        tx.category + ', ' +
        tx.amount + ', ' +
        tx.confirmations + ', ' +
        tx.blockhash + ', ' +
        tx.blockindex + ', ' +
        blocktime.toLocaleDateString() + ' ' + blocktime.toLocaleTimeString() + ', ' +
        tx.txid + ', ' +
        time.toLocaleDateString() + ' ' + time.toLocaleTimeString() + ', ' +
        timereceived.toLocaleDateString() + ' ' + timereceived.toLocaleTimeString() + '\n'
      );
    });

    tx_history_csv.end();
    socket.emit('alerts', 'Transaction_history.csv successfuly dumped inside of your Vanilla WebUI directory.');
  });

  /**
   * Backup wallet
   */
  socket.on('backupwallet', function() {
    rpc.call({'jsonrpc':'2.0', 'method':'backupwallet', 'params':[""], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC backupwallet ERROR\n\n', error);
        return;
      }

      if (response.hasOwnProperty('error')) {
        /**
         * error_code_wallet_error = -4
         */
        if (response.error.code === -4) {
          socket.emit('alerts', 'Backup failed.');
        }
      } else {
        socket.emit('alerts', 'Wallet successfuly backed up inside of your Vanilla executable directory.');
      }
    });
  });

  /**
   * Check wallet
   */
  socket.on('checkwallet', function() {
    rpc.call({'jsonrpc':'2.0', 'method':'checkwallet', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC checkwallet ERROR\n\n', error);
        return;
      }

      socket.emit('checkwallet_response', response.result);
    });
  });

  /**
   * Repair wallet
   */
  socket.on('repairwallet', function() {
    rpc.call({'jsonrpc':'2.0', 'method':'repairwallet', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC repairwallet ERROR\n\n', error);
        return;
      }

      socket.emit('repairwallet_response', response.result);
    });
  });

  /**
   * Passphrase change
   */
  socket.on('walletpassphrasechange', function(passphrase) {
    rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrasechange', 'params':[passphrase.old, passphrase.new], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC walletpassphrasechange ERROR\n\n', error);
        return;
      }

      if (response.hasOwnProperty('error')) {
        /**
         * error_code_wallet_passphrase_incorrect = -14
         */
        if (response.error.code === -14) {
          socket.emit('alerts', "You've entered an incorrect current passphrase.");
        }

        /**
         * error_code_wallet_wrong_enc_state = -15
         */
        if (response.error.code === -15) {
          socket.emit('alerts', 'Wallet is not encrypted.');
        }
      } else {
        socket.emit('alerts', 'Passphrase successfuly changed.');
      }
    });
  });

  /**
   * Dump private key
   */
  socket.on('dumpprivkey', function(key) {
    rpc.call({'jsonrpc':'2.0', 'method':'dumpprivkey', 'params':[key], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC dumpprivkey ERROR\n\n', error);
        return;
      }

      if (response.hasOwnProperty('error')) {
        /**
         * error_code_wallet_error = -4
         */
        if (response.error.code === -4) {
            socket.emit('alerts', "The address you've entered does not belong to this wallet.");
        }

        /**
         * error_code_invalid_address_or_key = -5
         */
        if (response.error.code === -5) {
            socket.emit('alerts', "The address you've entered is invalid.");
        }
      } else {
        socket.emit('alerts', 'Private key: ' + response.result);
      }
    });
  });

  /**
   * Dump wallet
   */
  socket.on('dumpwallet', function() {
    rpc.call({'jsonrpc':'2.0', 'method':'dumpwallet', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC dumpwallet ERROR\n\n', error);
        return;
      }

      socket.emit('alerts', 'Wallet.csv successfuly dumped in your .Vanillacoin/data directory.');
    });
  });

  /**
   * Check balances of watch-only addresses
   */
  function check_watchaddresses() {
    var promises = [];
    var save = false;

    for (var i in cache.watch_addresses) {
      promises.push(new Promise(function(resolve, reject) {
        (function(address) {
          https.get('https://blockchain.vanillacoin.net/ext/getbalance/' + address, function(response) {
            response.on('data', function(balance) {
              if (response.headers['content-type'] === 'text/html; charset=utf-8' || response.headers['content-type'] === 'application/json') {
                balance = JSON.parse(balance);

                if (balance.hasOwnProperty('error')) {
                  balance = 0;
                }

                if (cache.watch_addresses[address].balance !== balance) {
                  cache.watch_addresses[address].balance = balance;
                  save = true;
                }

                return resolve(save);
              }
            });
          }).on('error', function(error) {
            return reject('HTTPS https://blockchain.vanillacoin.net/ext/getbalance/' + address + ' ERROR\n\n' + error);
          });
        })(i);
      }));
    }

    Promise.all(promises).then(function AcceptHandler() {
      if (!cache.settings.hidden.hasOwnProperty('watchonly')) {
        cache.settings.hidden.watchonly = false;
      }

      socket.emit('watch_addresses', {
        'hidden':cache.settings.hidden.watchonly,
        'addresses':cache.watch_addresses
      });

      if (save) {
        fs.writeFile('data/watch_addresses.json', JSON.stringify(cache.watch_addresses, null, 2), function(error) {
          if (error) {
            console.log('FS.WRITE data/watch_addresses.json ERROR\n\n', error);
            return;
          }
        });
      }
    }, function ErrorHandler(error) {
      console.log(error);
    });
  }

  /**
   * Get location of provided IP
   */
  function https_getlocation(ip) {
    https.get('https://freegeoip.net/json/' + ip, function(response) {
      if (response.headers['content-type'] === 'application/json') {
        var buffer = '';

        response.on('data', function(data) {
          buffer += data;
        });

        response.on('end', function() {
          var location_info = JSON.parse(buffer);

          if (location_info) {
            cache.nodes.geodata[ip] = {
              'lon':location_info.longitude,
              'lat':location_info.latitude,
              'country':location_info.country_name
            };
          }
        });
      }
    }).on('error', function(error) {
      console.log('HTTPS https://freegeoip.net/json/' + ip + ' ERROR\n\n', error);
      return;
    });
  }

  /**
   * RPC method 'validateaddress'
   */
  function rpc_validateaddress(address, callback, passalong) {
    rpc.call({'jsonrpc':'2.0', 'method':'validateaddress', 'params':[address], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC validateaddress ERROR\n\n', error);
        return;
      }

      if (passalong) {
        callback(response.result, passalong);
      } else {
        callback(response.result);
      }
    });
  }

  /**
   * RPC method 'gettransaction'
   */
  function rpc_gettransaction(txid, callback) {
    rpc.call({'jsonrpc':'2.0', 'method':'gettransaction', 'params':[txid], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC gettransaction ERROR\n\n', error);
        return;
      }

      callback(response.result, txid);
    });
  }

  /**
   * RPC method 'walletpassphrase'
   */
  function rpc_walletpassphrase() {
    rpc.call({'jsonrpc':'2.0', 'method':'walletpassphrase', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC walletpassphrase (state check) ERROR\n\n', error);
        return;
      }

      socket.emit('wallet_status', response.error);
    });
  }

  /**
   * Update account information
   */
  function rpc_listreceivedby() {
    rpc.call([
        {'jsonrpc':'2.0', 'method':'listreceivedbyaddress', 'params':{'minconf':1, 'includeempty':true}, 'id':0},
        {'jsonrpc':'2.0', 'method':'listreceivedbyaccount', 'params':{'minconf':1, 'includeempty':true}, 'id':0}
      ], function(error, response) {

      if (error || !response) {
        console.log('RPC listreceivedbyaddress && listreceivedbyaccount ERROR\n\n', error);
        return;
      }

      var accounts = {};

      /**
       * Set accounts
       */
      response[1].result.forEach(function(byaccount) {
        if (!byaccount.account) {
          byaccount.account = 'Default';
        }

        var hash = crypto.createHash('md5').update(byaccount.account).digest('hex');
        var hidden = true;

        /**
         * If hash is found in settings, set visibility accordingly
         */
        if (cache.settings.hidden.hasOwnProperty(hash)) {
          hidden = cache.settings.hidden[hash];
        }

        /**
         * If there's no settings entry, display Default account addresses
         */
        if (!cache.settings.hidden.hasOwnProperty(hash) && byaccount.account === 'Default') {
          hidden = false;
        }

        accounts[hash] = {
          'account':byaccount.account,
          'hidden':hidden,
          'received':byaccount.amount,
          'addresses':[]
        };

        cache.settings.hidden[hash] = hidden;
      });

      /**
       * Push addresses to accounts
       */
      response[0].result.forEach(function(byaddress) {
        if (!byaddress.account) {
          byaddress.account = 'Default';
        }

        var hash = crypto.createHash('md5').update(byaddress.account).digest('hex');

        accounts[hash].addresses.push({
          'address':byaddress.address,
          'received':byaddress.amount,
          'confirmations':byaddress.confirmations
        });
      });

      cache.accounts = accounts;
      socket.emit('accounts', cache.accounts);
    });
  }

  /**
   * Update transactions
   */
  function rpc_listsinceblock() {
    rpc.call({'jsonrpc':'2.0', 'method':'listsinceblock', 'params':[], 'id':0}, function(error, response) {
      if (error || !response) {
        console.log('RPC listsinceblock ERROR\n\n', error);
        return;
      }

      var length_before = Object.keys(cache.transactions.edits).length;
      cache.transactions.log = [];

      response.result.transactions.forEach(function(tx) {
        if (!tx.account) {
          tx.account = 'Default';
        }

        /**
         * Convert to miliseconds
         */
        tx.timereceived *= 1000;
        tx.blocktime *= 1000;
        tx.time *= 1000;

        /**
         * Check if txid exists in transactions_edits
         */
        if (cache.transactions.edits[tx.txid]) {
          if (tx.category === 'generate' || tx.category === 'immature') {
            if (cache.transactions.edits[tx.txid].pos) {
              tx.pos = true;
              tx.address = cache.transactions.edits[tx.txid].address;
              tx.amount = cache.transactions.edits[tx.txid].amount;

              if (tx.category === 'generate') {
                tx.category = 'PoS reward';
              }
            } else {
              tx.pos = false;

              if (tx.category === 'generate') {
                tx.category = 'Incentive reward';
              }
            }
          }

          if (tx.category === 'receive') {
            if (cache.transactions.edits[tx.txid]['self-send']) {
              tx.category = 'Self-send';
            }
          }

          /**
           * Exclude sends to self, push everything else
           */
          if (!(tx.category === 'send' && cache.transactions.edits[tx.txid]['self-send'])) {
            cache.transactions.log.push(tx);
          }
        } else {
          if (tx.category === 'generate' || tx.category === 'immature') {
            rpc_gettransaction(tx.txid, function(response, txid) {
              if (response.vout[0].scriptPubKey.type === 'nonstandard') {
                if (response.amount < 0) {
                  response.amount = response.amount + response.details[0].amount;
                }

                cache.transactions.edits[txid] = {
                  'pos':true,
                  'address':response.vout[1].scriptPubKey.addresses[0],
                  'amount':response.amount
                };
              } else {
                cache.transactions.edits[txid] = {
                  'pos':false
                };
              }
            });
          }

          var is_mine = false;

          if (tx.category === 'send') {
            rpc_validateaddress(tx.address, function(address, txid) {
              if (address.ismine) {
                is_mine = true;

                cache.transactions.edits[txid] = {
                  'self-send':true
                };
              }
            }, tx.txid);
          }

          if (!is_mine) {
            cache.transactions.log.push(tx);
          }
        }

        if (tx.category === 'receive') {
          if (tx.confirmations === 0) {
            tx.category = 'Receiving';
          } else {
            tx.category = 'Received';
          }
        }

        if (tx.category === 'send') {
          if (tx.confirmations === 0) {
            tx.category = 'Sending';
          } else {
            tx.category = 'Sent';
          }
        }

        if (tx.category === 'immature') {
          tx.category = 'Immature';
        }
      });

      setTimeout(function() {
        if (Object.keys(cache.transactions.edits).length > length_before) {
          fs.writeFile('data/transactions_edits.json', JSON.stringify(cache.transactions.edits), function(error) {
            if (error) {
              console.log('FS.WRITE data/transactions_edits.json ERROR\n\n', error);
              return;
            }
          });
        }
      }, 1000);

      socket.emit('transactions', cache.transactions.log);
    });
  }

  setTimeout(function() {
    /**
     * Update client with error.code for wallet state (locked / unlocked / unencrypted)
     */
    rpc_walletpassphrase();

    /**
     * Update client with stylesheets, available currencies (for local currency select) & selected currency info
     */
    socket.emit('stylesheet', cache.settings.stylesheet);
    socket.emit('stylesheets', cache.stylesheets);
    socket.emit('local_currencies', cache.currencies.local.rates);

    if (cache.currencies.local.rates.hasOwnProperty(cache.settings.local_currency)) {
      if (cache.currencies.local.rates[cache.settings.local_currency].hasOwnProperty('btc')) {
        socket.emit('currency_info', {
          'code':cache.settings.local_currency,
          'btc':cache.currencies.local.rates[cache.settings.local_currency].btc,
          'vanilla_average':cache.currencies.vanilla.average
        });
      }
    }

    /**
     * Update wallet info on initial client connection and repeat every 10 seconds
     */
    (function update() {
      rpc.call([
          {'jsonrpc':'2.0', 'method':'getinfo', 'params':[], 'id':0},
          {'jsonrpc':'2.0', 'method':'getincentiveinfo', 'params':[], 'id':0}
        ], function(error, response) {

        if (error || !response) {
          console.log('RPC getinfo && getincentiveinfo ERROR\n\n', error);
          return;
        }

        cache.wallet_info = Object.assign({}, response[0].result, response[1].result);
        cache.wallet_info.version = cache.wallet_info.version.replace(':', ' ');

        socket.emit('wallet_info', cache.wallet_info);
      });

      setTimeout(update, 10000);
    })();

    /**
     * Update nodes info on initial client connection and repeat every 60 seconds
     */
    (function update() {
      rpc.call([
          {'jsonrpc':'2.0', 'method':'getpeerinfo', 'params':[], 'id':0},
          {'jsonrpc':'2.0', 'method':'getnetworkinfo', 'params':[], 'id':0}
        ], function(error, response) {

        if (error || !response) {
          console.log('RPC getpeerinfo && getnetworkinfo ERROR\n\n', error);
          return;
        }

        var endpoints = [];
        var save = false;

        cache.wallet_info.udp_connections = response[1].result.udp.connections;

        var connected_nodes = response[0].result.filter(function(peer) {
          return parseInt(peer.lastsend) !== 0;
        });

        connected_nodes.forEach(function(peer) {
          peer.group = 'Connected nodes';
          peer.subver_clean = peer.subver.replace('/', '').replace('/', '').replace(':',' ');

          /**
           * Convert to miliseconds
           */
          peer.lastsend *= 1000;
          peer.lastrecv *= 1000;
          peer.conntime *= 1000;

          /**
           * Check if there's geodata on IP, else request it
           */
          var ip = peer.addr.split(':')[0];

          if (cache.nodes.geodata[ip]) {
            peer.lon = cache.nodes.geodata[ip].lon;
            peer.lat = cache.nodes.geodata[ip].lat;
            peer.country = cache.nodes.geodata[ip].country;
          } else {
            https_getlocation(ip);
            save = true;
          }
        });

        response[1].result.endpoints.forEach(function(endpoint) {
          var ip = endpoint.split(':')[0];

          if (cache.nodes.geodata[ip]) {
            endpoints.push({
              'addr':endpoint,
              'group':'Network endpoints',
              'lon':cache.nodes.geodata[ip].lon,
              'lat':cache.nodes.geodata[ip].lat,
              'country':cache.nodes.geodata[ip].country
            });
          } else {
            https_getlocation(ip);
            save = true;
          }
        });

        cache.nodes.connected = connected_nodes;
        cache.nodes.endpoints = endpoints;

        socket.emit('nodes_geomap', cache.nodes.endpoints.concat(cache.nodes.connected));
        socket.emit('nodes_connected', cache.nodes.connected);

        if (save) {
          setTimeout(function() {
            fs.writeFile('data/nodes_geodata.json', JSON.stringify(cache.nodes.geodata), function(error) {
              if (error) {
                console.log('FS.WRITE data/nodes_geodata.json ERROR\n\n', error);
                return;
              }
            });
          }, 1000);
        }
      });

      setTimeout(update, 60000);
    })();

    /**
     * Update latest trades from Poloniex & Bittrex on initial client connection and repeat every 75 seconds
     */
    (function update() {
      var promises = [];

      promises.push(new Promise(function(resolve, reject) {
        var trades = [];

        https.get('https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL', function(response) {
          if (response.headers['content-type'] === 'application/json') {
            var buffer = '';

            response.on('data', function(data) {
              buffer += data;
            });

            response.on('end', function() {
              var trade_history = JSON.parse(buffer);

              if (trade_history !== null) {
                cache.currencies.vanilla.poloniex = parseFloat(trade_history[0].rate);

                trade_history.forEach(function(trade) {
                  trades.push({
                    'exchange':'poloniex',
                    'date':trade.date,
                    'type':trade.type,
                    'vanilla_rate':trade.rate,
                    'vanilla_amount':trade.amount,
                    'btc_total':trade.total
                  });
                });

                return resolve(trades);
              }
            });
          }
        }).on('error', function(error) {
          return reject('HTTPS poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL ERROR\n\n' + error);
        });
      }));

      promises.push(new Promise(function(resolve, reject) {
        var trades = [];

        https.get('https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50', function(response) {
          if (response.headers['content-type'] === 'application/json; charset=utf-8') {
            var buffer = '';

            response.on('data', function(data) {
              buffer += data;
            });

            response.on('end', function() {
              var trade_history = JSON.parse(buffer);

              if (trade_history) {
                if (trade_history.result) {
                  if (trade_history.result.length !== 0) {
                    cache.currencies.vanilla.bittrex = parseFloat(trade_history.result[0].Price);

                    trade_history.result.forEach(function(trade) {
                      trades.push({
                        'exchange':'bittrex',
                        'date':trade.TimeStamp,
                        'type':trade.OrderType,
                        'vanilla_rate':trade.Price,
                        'vanilla_amount':trade.Quantity,
                        'btc_total':trade.Total
                      });
                    });

                    return resolve(trades);
                  }
                }
              }
            });
          }
        }).on('error', function(error) {
          return reject('HTTPS https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50 ERROR\n\n' + error);
        });
      }));

      Promise.all(promises).then(function AcceptHandler(trades) {
        var poloniex = trades[0];
        var bittrex = trades[1];
        var trades = poloniex.concat(bittrex);

        if (trades.length !== 0) {
          cache.trades = trades;
          socket.emit('trades', cache.trades);
        }

        if (cache.currencies.vanilla.poloniex && cache.currencies.vanilla.bittrex) {
          cache.currencies.vanilla.average = (cache.currencies.vanilla.poloniex + cache.currencies.vanilla.bittrex) / 2;
        } else {
          cache.currencies.vanilla.average = cache.currencies.vanilla.poloniex + cache.currencies.vanilla.bittrex;
        }

        socket.emit('currency_info', {
          'code':cache.settings.local_currency,
          'btc':cache.currencies.local.rates[cache.settings.local_currency].btc,
          'vanilla_average':cache.currencies.vanilla.average
        });
      }, function ErrorHandler(error) {
        console.log(error);
      });

      setTimeout(update, 75000);
    })();

    /**
     * Update receivedby totals on initial client connection and repeat every 90 seconds
     */
    (function update() {
      rpc_listreceivedby();
      setTimeout(update, 90000);
    })();

    /**
     * Update transaction history on initial client connection and repeat every 2 minutes
     */
    (function update() {
      rpc_listsinceblock();
      setTimeout(update, 120000);
    })();

    /**
     * Update watch-only addresses on initial client connection and repeat every 15 minutes
     */
    (function update() {
      check_watchaddresses();
      setTimeout(update, 900000);
    })();
  }, 100);

  /**
   * Update latest BTC prices on initial client connection and repeat every hour
   */
  (function update() {
    https.get('https://www.bitstamp.net/api/ticker_hour/', function(response) {
      if (response.headers['content-type'] === 'application/json') {
        var buffer = '';

        response.on('data', function(data) {
          buffer += data;
        });

        response.on('end', function() {
          var ticker_hourly = JSON.parse(buffer);

          if (ticker_hourly.hasOwnProperty('last')) {
            for (var i in cache.currencies.local.rates) {
              cache.currencies.local.rates[i].btc = cache.currencies.local.rates[i].rate * ticker_hourly.last;
            }

            fs.writeFile('data/currencies.json', JSON.stringify(cache.currencies), function(error) {
              if (error) {
                console.log('FS.WRITE data/currencies.json ERROR\n\n', error);
                return;
              }
            });
          }
        });
      }
    }).on('error', function(error) {
      console.log('HTTPS www.bitstamp.net/api/ticker_hour/ ERROR\n\n', error);
      return;
    });

    setTimeout(update, 3600000);
  })();
});

/**
 * GET root page
 */
router.get('/', function(req, res, next) {
  res.render('index', {
    title:'Vanilla WebUI'
  });
});

module.exports = router;
