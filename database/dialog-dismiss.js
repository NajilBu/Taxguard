(()=>{
  const records=new WeakMap(),stack=[];
  let bypass=false,pressed=null;
  const values=dialog=>JSON.stringify([...dialog.querySelectorAll('input,select,textarea,[contenteditable="true"]')].map(el=>[
    el.name||el.id||el.tagName,el.type,el.value??el.innerHTML,el.checked,
    el.files?[...el.files].map(f=>[f.name,f.size,f.lastModified]):null
  ]));
  const track=dialog=>{
    records.get(dialog)?.observer.disconnect();
    const record={baseline:values(dialog),form:dialog.querySelector('form')};
    record.observer=new MutationObserver(()=>{
      const form=dialog.querySelector('form');
      // The shared dialog also switches from read-only details to an editor.
      if(form!==record.form){record.form=form;record.baseline=values(dialog);}
    });
    record.observer.observe(dialog,{childList:true,subtree:true});
    records.set(dialog,record);
    const index=stack.indexOf(dialog);if(index>=0)stack.splice(index,1);
    stack.push(dialog);
  };
  const show=HTMLDialogElement.prototype.showModal;
  let layerId=0;
  window.workspaceDialog=(reuse=false)=>{
    const parent=document.querySelector('#modal');
    if(!parent.open||reuse){if(!parent.open)delete parent.dataset.clientId;return parent;}
    const dialog=document.createElement('dialog');
    const focus=document.activeElement;
    parent.id='workspace-parent-'+(++layerId);
    dialog.id='modal';dialog.className='workspace-child-dialog';
    dialog.workspaceParent=parent;
    document.body.append(dialog);
    const close=dialog.close.bind(dialog);
    dialog.close=()=>{
      if(!dialog.isConnected)return;
      close();
      dialog.remove();
      parent.id='modal';
      if(parent.open&&focus?.isConnected)focus.focus();
    };
    parent.addEventListener('close',()=>{if(!parent.open&&dialog.isConnected)dialog.close();},{once:true});
    return dialog;
  };
  window.dismissWorkspaceDialog=dialog=>request(dialog);
  HTMLDialogElement.prototype.showModal=function(){
    clearTimeout(this.workspaceCloseTimer);
    this.classList.remove('closing');
    const result=show.call(this);track(this);return result;
  };
  const top=()=>[...stack].reverse().find(d=>d.open&&d.isConnected);
  const dismiss=dialog=>{
    bypass=true;
    try{
      const event=new Event('cancel',{cancelable:true});
      if(dialog.dispatchEvent(event))dialog.close();
    }finally{bypass=false;}
  };
  const request=dialog=>{
    if(!dialog?.open)return;
    const record=records.get(dialog);
    if(!record||record.baseline===values(dialog)){dismiss(dialog);return;}
    if(document.querySelector('#discard-dialog'))return;
    const warning=document.createElement('dialog');
    warning.id='discard-dialog';warning.setAttribute('aria-labelledby','discard-title');
    warning.innerHTML='<h2 id="discard-title">Discard unsaved changes?</h2><p>You have unsaved changes. Closing this popup will discard them.</p><div class="modal-actions"><button type="button" class="btn primary" id="keep-editing">Keep editing</button><button type="button" class="btn" id="discard-changes">Discard changes</button></div>';
    const focus=document.activeElement;
    const cleanup=()=>{warning.close();warning.remove();if(dialog.open&&focus?.isConnected)focus.focus();};
    warning.addEventListener('close',()=>warning.remove(),{once:true});
    warning.querySelector('#keep-editing').onclick=cleanup;
    warning.querySelector('#discard-changes').onclick=()=>{cleanup();dismiss(dialog);};
    document.body.append(warning);warning.showModal();
    warning.querySelector('#keep-editing').focus();
  };
  document.addEventListener('cancel',event=>{
    if(bypass||!(event.target instanceof HTMLDialogElement))return;
    event.preventDefault();event.stopImmediatePropagation();request(event.target);
  },true);
  const outside=(dialog,event)=>{
    const rect=dialog.getBoundingClientRect();
    return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
  };
  document.addEventListener('pointerdown',event=>{
    const dialog=top();
    pressed=event.button===0&&dialog&&outside(dialog,event)?dialog:null;
  },true);
  document.addEventListener('pointerup',event=>{
    const dialog=pressed;pressed=null;
    if(dialog&&event.button===0&&dialog===top()&&outside(dialog,event)){
      event.preventDefault();event.stopPropagation();request(dialog);
    }
  },true);
  document.addEventListener('pointercancel',()=>{pressed=null;},true);
  document.addEventListener('close',event=>{
    if(!(event.target instanceof HTMLDialogElement))return;
    if(event.target.open)return;
    records.get(event.target)?.observer.disconnect();
    const index=stack.indexOf(event.target);if(index>=0)stack.splice(index,1);
  },true);
})();
